-- Migration operacional gerada do candidato validado; ativação separada.
-- SHA256 do candidato: 98b6b8bf978c01d60e53127bacd26010855dfdd54f88a29475519a4ae29d4a8f
-- Não cria vendas, contratos, recebíveis, pagamentos nem decisões automáticas.
-- Identidade previamente provisionada pelo proprietário, referenciada pelos IDs existentes.
create schema altnix_operational;
revoke all on schema altnix_operational from public,anon,authenticated;
grant usage on schema altnix_operational to service_role;
create table altnix_operational.service_binding(
 service_id uuid primary key references public.commercial_contract_services(id) on delete restrict,
 package_id uuid not null references public.commercial_contract_packages(id) on delete restrict,
 client_id uuid not null references public.clients(id) on delete restrict,
 advertiser_id uuid not null,
 campaign_id uuid not null unique,
 approved_by uuid not null,
 approved_at timestamptz not null default now(),
 enabled boolean not null default false,
 financial_grace_days integer check(financial_grace_days between 0 and 30),
 financial_approved_by uuid,
 financial_approved_at timestamptz,
 check(financial_grace_days is null or (financial_approved_by is not null and financial_approved_at is not null))
);
create table altnix_operational.service_outbox(
 event_id uuid primary key,
 service_id uuid not null references altnix_operational.service_binding(service_id) on delete restrict,
 revision bigint not null check(revision between 1 and 9007199254740991),
 payload jsonb not null,
 decision_actor uuid not null,
 decision_origin text not null default 'manual' check(decision_origin in ('manual','finance')),
 decision_reason text not null check(length(btrim(decision_reason)) between 1 and 500),
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 claim_token uuid,
 claimed_at timestamptz,
 attempts integer not null default 0 check(attempts between 0 and 5),
 retry_after timestamptz not null default now(),
 review_required boolean not null default false,
 unique(service_id,revision)
);
alter table altnix_operational.service_binding enable row level security;
alter table altnix_operational.service_outbox enable row level security;
revoke all on altnix_operational.service_binding,altnix_operational.service_outbox from public,anon,authenticated,service_role;
grant select on altnix_operational.service_binding,altnix_operational.service_outbox to service_role;
grant insert on altnix_operational.service_outbox to service_role;
grant update(delivered_at,claim_token,claimed_at,attempts,retry_after,review_required) on altnix_operational.service_outbox to service_role;
create policy binding_read on altnix_operational.service_binding for select to service_role using(true);
create policy outbox_read on altnix_operational.service_outbox for select to service_role using(true);
create policy outbox_append on altnix_operational.service_outbox for insert to service_role with check(true);
create policy outbox_ack on altnix_operational.service_outbox for update to service_role using(true) with check(true);
-- O chamador futuro deve ser servidor autorizado, com decisão explícita auditada.
-- Nenhuma regra de autorização pode ser deduzida de um pagamento global.
create function public.altnix_queue_service_authorization(
 p_service uuid,p_event uuid,p_actor uuid,p_state text,p_effective timestamptz,p_reason text,p_origin text default 'manual'
) returns jsonb language plpgsql security invoker set search_path='' as $queue$
declare b altnix_operational.service_binding%rowtype; old altnix_operational.service_outbox%rowtype; rev bigint; payload jsonb;
begin
 if p_origin is null or p_origin not in ('manual','finance') or p_event is null or p_actor is null or p_service is null or p_state is null or p_state not in ('authorized','grace','suspended','ended')
 or p_effective>statement_timestamp() or p_reason is null or length(btrim(p_reason)) not between 1 and 500 then return null;end if;
 -- Serializar evento e serviço sem permissões de UPDATE sobre vínculo.
 perform pg_advisory_xact_lock(hashtextextended('altnix-service:'||p_service::text,0));
 select * into b from altnix_operational.service_binding where service_id=p_service and enabled;
 if not found then return null;end if;
 if not exists(select 1 from public.commercial_contract_services s join public.commercial_contract_packages p on p.id=s.package_id
 join public.commercial_sales v on v.id=p.commercial_sale_id
 where s.id=b.service_id and p.id=b.package_id and p.client_id=b.client_id and v.client_id=b.client_id and s.service_channel='led_panel'
 and (p_state in ('suspended','ended') or exists(select 1 from public.client_digital_export_permissions e where e.client_id=p.client_id and e.enabled))) then return null;end if;
 select * into old from altnix_operational.service_outbox where event_id=p_event;
 if found then
  if old.service_id=p_service and old.decision_actor=p_actor and old.decision_origin=p_origin and old.decision_reason=p_reason
   and old.payload->>'status'=p_state and (p_effective is null or (old.payload->>'effectiveAt')::timestamptz=p_effective) then return old.payload;end if;
  return null;
 end if;
 select coalesce(max(o.revision),0)+1 into rev from altnix_operational.service_outbox o where o.service_id=p_service;
 payload=jsonb_build_object('origin','jornal_ir','contractVersion','1','serviceCode','altnix_informativo',
 'tenantId','00000000-0000-0000-0000-000000000001','advertiserId',b.advertiser_id,'canonicalClientId',b.client_id,
 'canonicalContractId',b.package_id,'canonicalServiceId',b.service_id,
 'campaignId',b.campaign_id,'eventId',p_event,'revision',rev,'status',p_state,
 'effectiveAt',to_char(coalesce(p_effective,statement_timestamp()) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 insert into altnix_operational.service_outbox(event_id,service_id,revision,payload,decision_actor,decision_reason,decision_origin)
 values(p_event,p_service,rev,payload,p_actor,p_reason,p_origin);
 return payload;
 exception when unique_violation then return null;
end;$queue$;
revoke all on function public.altnix_queue_service_authorization(uuid,uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.altnix_queue_service_authorization(uuid,uuid,uuid,text,timestamptz,text,text) to service_role;

-- Somente a revisão mais recente de cada serviço pode ser reivindicada.
-- Um serviço revogado não envia nova autorização positiva. Suspensão/fim
-- continuam elegíveis para não deixar a última autorização positiva ativa.
create function public.altnix_claim_service_authorizations(p_limit integer default 5)
returns table(event_id uuid,claim_token uuid,payload jsonb)
language sql security invoker set search_path='' as $claim$
 with next_rows as (
 select o.event_id from altnix_operational.service_outbox o
 join altnix_operational.service_binding b on b.service_id=o.service_id
 where o.delivered_at is null and not o.review_required and o.attempts<5
 and o.retry_after<=statement_timestamp()
 and (o.claimed_at is null or o.claimed_at<statement_timestamp()-interval '2 minutes')
 and not exists(select 1 from altnix_operational.service_outbox n where n.service_id=o.service_id and n.revision>o.revision)
 and (o.payload->>'status' in ('suspended','ended') or
 (b.enabled and exists(select 1 from public.client_digital_export_permissions p where p.client_id=b.client_id and p.enabled)))
 order by o.created_at,o.event_id limit greatest(0,least(coalesce(p_limit,0),10))
 for update of o skip locked
 )
 update altnix_operational.service_outbox o set claim_token=gen_random_uuid(),claimed_at=statement_timestamp(),attempts=o.attempts+1
 from next_rows n where n.event_id=o.event_id
 returning o.event_id,o.claim_token,o.payload;
$claim$;
revoke all on function public.altnix_claim_service_authorizations(integer) from public,anon,authenticated;
grant execute on function public.altnix_claim_service_authorizations(integer) to service_role;
create function public.altnix_finish_service_authorization(p_event uuid,p_token uuid,p_result text)
returns boolean language plpgsql security invoker set search_path='' as $finish$
declare affected integer;
begin
 if p_result is null or p_result not in ('applied','retryable','review_required','disabled','invalid') then return false;end if;
 update altnix_operational.service_outbox o set
 delivered_at=case when p_result='applied' then statement_timestamp() else null end,
 review_required=p_result in ('review_required','invalid') or (p_result='retryable' and o.attempts>=5),
 attempts=case when p_result='disabled' then greatest(o.attempts-1,0) else o.attempts end,
 retry_after=statement_timestamp()+interval '5 minutes',
 claim_token=null,claimed_at=null
 where o.event_id=p_event and o.claim_token=p_token and o.delivered_at is null;
 get diagnostics affected=row_count;
 return affected=1;
end;$finish$;
revoke all on function public.altnix_finish_service_authorization(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.altnix_finish_service_authorization(uuid,uuid,text) to service_role;

-- Exposição mínima para a interface da venda. Nenhuma decisão é criada.
create function public.altnix_read_service_authorization(p_service uuid)
returns jsonb language sql stable security invoker set search_path='' as $read$
 select jsonb_build_object('campaignId',b.campaign_id,'enabled',b.enabled,
 'revision',coalesce(o.revision,0),'status',o.payload->>'status',
 'delivery',case when o.event_id is null then 'none' when o.delivered_at is not null then 'confirmed'
 when o.review_required or o.attempts>=5 then 'review' else 'pending' end)
 from altnix_operational.service_binding b
 left join lateral (select x.* from altnix_operational.service_outbox x where x.service_id=b.service_id order by x.revision desc limit 1) o on true
 where b.service_id=p_service;
$read$;
revoke all on function public.altnix_read_service_authorization(uuid) from public,anon,authenticated;
grant execute on function public.altnix_read_service_authorization(uuid) to service_role;

-- Vínculo em duas fases: reserva desabilitada; habilitação só após confirmação
-- exata do Informativo pelo backend proprietário. Não cria contrato espelho.
grant insert(service_id,package_id,client_id,advertiser_id,campaign_id,approved_by) on altnix_operational.service_binding to service_role;
grant update(enabled) on altnix_operational.service_binding to service_role;
create policy binding_reserve on altnix_operational.service_binding for insert to service_role with check(not enabled);
create policy binding_confirm on altnix_operational.service_binding for update to service_role using(true) with check(true);
create function public.altnix_prepare_service_binding(p_service uuid,p_advertiser uuid,p_campaign uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $prepare$
declare b altnix_operational.service_binding%rowtype;
begin
 if p_service is null or p_advertiser is null or p_campaign is null or p_actor is null then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('altnix-service:'||p_service::text,0));
 insert into altnix_operational.service_binding(service_id,package_id,client_id,advertiser_id,campaign_id,approved_by)
 select s.id,p.id,p.client_id,p_advertiser,p_campaign,p_actor
 from public.commercial_contract_services s join public.commercial_contract_packages p on p.id=s.package_id
 join public.commercial_sales v on v.id=p.commercial_sale_id and v.client_id=p.client_id
 join public.client_digital_export_permissions e on e.client_id=p.client_id and e.enabled
 where s.id=p_service and s.service_channel='led_panel'
 on conflict do nothing;
 select * into b from altnix_operational.service_binding where service_id=p_service and advertiser_id=p_advertiser and campaign_id=p_campaign and approved_by=p_actor;
 if not found or not exists(select 1 from public.commercial_contract_services s join public.commercial_contract_packages p on p.id=s.package_id
 join public.commercial_sales v on v.id=p.commercial_sale_id and v.client_id=p.client_id
 join public.client_digital_export_permissions e on e.client_id=p.client_id and e.enabled
 where s.id=b.service_id and s.service_channel='led_panel' and p.id=b.package_id and p.client_id=b.client_id) then return null;end if;
 return jsonb_build_object('origin','jornal_ir','contractVersion','1','tenantId','00000000-0000-0000-0000-000000000001',
 'campaignId',b.campaign_id,'advertiserId',b.advertiser_id,'canonicalClientId',b.client_id,'canonicalContractId',b.package_id,'canonicalServiceId',b.service_id,'approvedBy',b.approved_by);
end;$prepare$;
revoke all on function public.altnix_prepare_service_binding(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.altnix_prepare_service_binding(uuid,uuid,uuid,uuid) to service_role;
create function public.altnix_confirm_service_binding(p_service uuid,p_advertiser uuid,p_campaign uuid,p_actor uuid)
returns boolean language plpgsql security invoker set search_path='' as $confirm$
declare n integer;
begin
 update altnix_operational.service_binding b set enabled=true
 where b.service_id=p_service and b.advertiser_id=p_advertiser and b.campaign_id=p_campaign and b.approved_by=p_actor
 and exists(select 1 from public.commercial_contract_services s join public.commercial_contract_packages p on p.id=s.package_id
 join public.commercial_sales v on v.id=p.commercial_sale_id and v.client_id=p.client_id
 join public.client_digital_export_permissions e on e.client_id=p.client_id and e.enabled
 where s.id=b.service_id and s.service_channel='led_panel' and p.id=b.package_id and p.client_id=b.client_id);
 get diagnostics n=row_count;
 return n=1;
end;$confirm$;
revoke all on function public.altnix_confirm_service_binding(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.altnix_confirm_service_binding(uuid,uuid,uuid,uuid) to service_role;

create function public.altnix_service_binding_context(p_service uuid)
returns jsonb language sql stable security invoker set search_path='' as $context$
 select jsonb_build_object('clientId',p.client_id,'campaignId',b.campaign_id,'advertiserId',b.advertiser_id)
 from public.commercial_contract_services s join public.commercial_contract_packages p on p.id=s.package_id
 join public.commercial_sales v on v.id=p.commercial_sale_id and v.client_id=p.client_id
 join public.client_digital_export_permissions e on e.client_id=p.client_id and e.enabled
 left join altnix_operational.service_binding b on b.service_id=s.id
 where s.id=p_service and s.service_channel='led_panel';
$context$;
revoke all on function public.altnix_service_binding_context(uuid) from public,anon,authenticated;
grant execute on function public.altnix_service_binding_context(uuid) to service_role;

-- Avaliação autoritativa: reutiliza saldo já calculado pelo Financeiro, incluindo
-- recibos/ajustes não estornados. Nunca rateia pagamento de venda multiproduto.
-- Retorna indicação, não cria títulos, cobrança, autorização ou cron.
create function public.altnix_assess_service_finance(p_service uuid,p_grace_days integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $finance$
declare
 x record;
 civil_day date:=(statement_timestamp() at time zone 'America/Sao_Paulo')::date;
 n integer; distinct_n integer; total numeric; bad integer; oldest date;
begin
 if p_service is null or p_grace_days is null or p_grace_days not between 0 and 30 then return null;end if;
 select s.starts_on,s.ends_on,v.id as sale_id,v.client_id,v.status,v.commercial_condition,v.amount,v.installments_count,v.items_snapshot,
 (select count(*) from public.commercial_contract_services t where t.package_id=p.id) as service_count,
 exists(select 1 from public.client_digital_export_permissions e where e.client_id=v.client_id and e.enabled) as export_enabled
 into x
 from public.commercial_contract_services s join public.commercial_contract_packages p on p.id=s.package_id
 join public.commercial_sales v on v.id=p.commercial_sale_id and v.client_id=p.client_id
 where s.id=p_service and s.service_channel='led_panel';
 if not found then return null;end if;
 if x.status='cancelled' or (x.ends_on is not null and x.ends_on<civil_day) then
  return jsonb_build_object('state','ended','reason','service_ended');
 end if;
 if not x.export_enabled then return jsonb_build_object('state','suspended','reason','export_revoked');end if;
 if x.status not in ('approved','active') or x.starts_on is null or x.starts_on>civil_day then
  return jsonb_build_object('state','review','reason','sale_or_period_not_ready');
 end if;
 if x.service_count<>1 or x.items_snapshot is null or jsonb_typeof(x.items_snapshot)<>'array' then
  return jsonb_build_object('state','review','reason','allocation_not_proven');
 end if;
 if jsonb_array_length(x.items_snapshot)<>1 or x.items_snapshot->0->>'serviceChannel' is distinct from 'led_panel' then
  return jsonb_build_object('state','review','reason','allocation_not_proven');
 end if;
 if x.commercial_condition not in ('cash','installments') then
  return jsonb_build_object('state','review','reason','non_monetary_or_undefined');
 end if;
 if x.amount is null or x.amount<=0 or x.installments_count is null or x.installments_count not between 1 and 120 then
  return jsonb_build_object('state','review','reason','billing_incomplete');
 end if;
 select count(*),count(distinct r.installment_number),coalesce(sum(r.original_amount),0),
 count(*) filter(where r.client_id is distinct from x.client_id or r.status is null or r.status not in ('open','partially_paid','paid')
 or r.installment_number is null or r.installment_number not between 1 and x.installments_count
 or r.original_amount is null or r.original_amount<=0 or r.due_date is null or r.balance is null or r.balance<0
 or (r.status='paid' and r.balance<>0) or (r.status<>'paid' and r.balance=0)),
 min(r.due_date) filter(where r.balance>0 and r.due_date<civil_day)
 into n,distinct_n,total,bad,oldest
 from public.receivables_with_balance r where r.commercial_sale_id=x.sale_id;
 if n<>x.installments_count or distinct_n<>n or total<>x.amount or bad<>0 then
  return jsonb_build_object('state','review','reason','billing_incomplete');
 end if;
 if oldest is null then return jsonb_build_object('state','authorized','reason','no_overdue_balance');end if;
 if civil_day<=oldest+p_grace_days then return jsonb_build_object('state','grace','reason','overdue_within_grace','oldestDue',oldest);end if;
 return jsonb_build_object('state','suspended','reason','overdue_after_grace','oldestDue',oldest);
end;$finance$;
revoke all on function public.altnix_assess_service_finance(uuid,integer) from public,anon,authenticated;
grant execute on function public.altnix_assess_service_finance(uuid,integer) to service_role;

-- Opt-in explícito após vínculo e uma decisão humana. NULL desativa a regra.
-- Não existe tolerância padrão presumida. Venda mista/sem evidência não é ativável.
grant update(financial_grace_days,financial_approved_by,financial_approved_at) on altnix_operational.service_binding to service_role;
create function public.altnix_configure_service_finance(p_service uuid,p_actor uuid,p_grace_days integer)
returns boolean language plpgsql security invoker set search_path='' as $configure$
declare n integer; evidence jsonb;
begin
 if p_service is null or p_actor is null or (p_grace_days is not null and p_grace_days not between 0 and 30) then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('altnix-service:'||p_service::text,0));
 if p_grace_days is not null then
  evidence=public.altnix_assess_service_finance(p_service,p_grace_days);
  if evidence is null or evidence->>'reason' not in ('no_overdue_balance','overdue_within_grace','overdue_after_grace') then return false;end if;
  if not exists(select 1 from altnix_operational.service_outbox o where o.service_id=p_service
   and o.revision=(select max(t.revision) from altnix_operational.service_outbox t where t.service_id=p_service)
   and (o.payload->>'status' in ('authorized','grace') or (o.decision_origin='finance' and o.payload->>'status'='suspended'))) then return false;end if;
 end if;
 update altnix_operational.service_binding set financial_grace_days=p_grace_days,
 financial_approved_by=p_actor,financial_approved_at=statement_timestamp()
 where service_id=p_service and enabled;
 get diagnostics n=row_count;
 return n=1;
end;$configure$;
revoke all on function public.altnix_configure_service_finance(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.altnix_configure_service_finance(uuid,uuid,integer) to service_role;

-- Reavalia apenas o serviço escolhido. Serializa com decisões manuais.
-- Uma suspensão manual/encerramento nunca é desfeito pelo pagamento.
-- Dúvida financeira => revisão, não gera liberação/suspensão presumida.
create function public.altnix_apply_service_finance(p_service uuid)
returns text language plpgsql security invoker set search_path='' as $apply$
declare b altnix_operational.service_binding%rowtype; last_event altnix_operational.service_outbox%rowtype; evidence jsonb; desired text; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('altnix-service:'||p_service::text,0));
 select * into b from altnix_operational.service_binding where service_id=p_service and enabled and financial_grace_days is not null;
 if not found then return 'disabled';end if;
 select * into last_event from altnix_operational.service_outbox where service_id=p_service order by revision desc limit 1;
 if not found or last_event.payload->>'status'='ended' then return 'manual_required';end if;
 evidence=public.altnix_assess_service_finance(p_service,b.financial_grace_days);
 if evidence is null or evidence->>'state'='review' then return 'review';end if;
 desired=evidence->>'state';
 if last_event.payload->>'status'='suspended' and last_event.decision_origin='manual' and desired<>'ended' then return 'manual_required';end if;
 if desired=last_event.payload->>'status' then return 'unchanged';end if;
 result=public.altnix_queue_service_authorization(p_service,gen_random_uuid(),b.financial_approved_by,desired,null,'finance_rule:'||(evidence->>'reason'),'finance');
 if result is null then return 'review';end if;
 return 'queued';
end;$apply$;
revoke all on function public.altnix_apply_service_finance(uuid) from public,anon,authenticated;
grant execute on function public.altnix_apply_service_finance(uuid) to service_role;


-- Reavaliação central em lotes por venda (baixa/estorno) ou por cursor (dia civil).
-- Apenas políticas opt-in; sem consulta nos aparelhos, sem novo agendamento.
-- A fila de entrega existente continua sendo a única saída operacional.
create function public.altnix_reassess_service_finance_batch(p_sale uuid,p_after uuid,p_limit integer default 25)
returns table(service_id uuid,outcome text)
language plpgsql security invoker set search_path='' as $batch$
declare candidate uuid;
begin
 if p_limit is null or p_limit not between 1 and 50 then return;end if;
 for candidate in
  select b.service_id from altnix_operational.service_binding b
  join public.commercial_contract_packages p on p.id=b.package_id and p.client_id=b.client_id
  where b.enabled and b.financial_grace_days is not null
    and (p_sale is null or p.commercial_sale_id=p_sale)
    and (p_after is null or b.service_id>p_after)
  order by b.service_id limit p_limit
 loop
  service_id:=candidate;
  outcome:=public.altnix_apply_service_finance(candidate);
  return next;
 end loop;
end;$batch$;
revoke all on function public.altnix_reassess_service_finance_batch(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.altnix_reassess_service_finance_batch(uuid,uuid,integer) to service_role;


-- Após uma operação financeira confirmada, resolver a venda pelo título
-- persistido. Não aceitar cliente/venda do navegador nem emitir cobranças.
create function public.altnix_reassess_receivable_services(p_receivable_ids uuid[])
returns integer language plpgsql security invoker set search_path='' as $receivable_event$
declare candidate uuid; processed integer:=0;
begin
 if p_receivable_ids is null or cardinality(p_receivable_ids) not between 1 and 50
  or array_position(p_receivable_ids,null::uuid) is not null then return 0;end if;
 for candidate in
  select distinct b.service_id from altnix_operational.service_binding b
  join public.commercial_contract_packages p on p.id=b.package_id and p.client_id=b.client_id
  join public.receivables_with_balance r on r.commercial_sale_id=p.commercial_sale_id and r.client_id=b.client_id
  where b.enabled and b.financial_grace_days is not null and r.id=any(p_receivable_ids)
  order by b.service_id limit 50
 loop
  perform public.altnix_apply_service_finance(candidate);
  processed:=processed+1;
 end loop;
 return processed;
end;$receivable_event$;
revoke all on function public.altnix_reassess_receivable_services(uuid[]) from public,anon,authenticated;
grant execute on function public.altnix_reassess_receivable_services(uuid[]) to service_role;


-- Um cursor por dia civil, persistido na mesma transação que as decisões.
-- Um único trabalhador por vez. Repetição no mesmo dia não varre serviços
-- já processados; a fila de entrega pode ser recuperada independentemente.
create table altnix_operational.finance_daily_progress(
 singleton boolean primary key default true check(singleton),
 civil_day date not null,
 last_service_id uuid,
 completed boolean not null default false,
 processed integer not null default 0 check(processed>=0),
 queued integer not null default 0 check(queued>=0),
 review_count integer not null default 0 check(review_count>=0),
 updated_at timestamptz not null default now()
);
alter table altnix_operational.finance_daily_progress enable row level security;
revoke all on altnix_operational.finance_daily_progress from public,anon,authenticated,service_role;
grant select,insert,update on altnix_operational.finance_daily_progress to service_role;
create policy finance_daily_progress_server on altnix_operational.finance_daily_progress for all to service_role using(true) with check(true);
create function public.altnix_run_daily_service_finance(p_limit integer default 25)
returns jsonb language plpgsql security invoker set search_path='' as $daily$
declare
 d date:=(statement_timestamp() at time zone 'America/Sao_Paulo')::date;
 progress altnix_operational.finance_daily_progress%rowtype;
 item record; n integer:=0; q integer:=0; r integer:=0; cursor_id uuid;
begin
 if p_limit is null or p_limit not between 1 and 50 then return null;end if;
 if not pg_try_advisory_xact_lock(hashtextextended('altnix-service-finance-daily',0)) then
  return jsonb_build_object('status','busy','processed',0,'queued',0,'review',0,'complete',false);
 end if;
 insert into altnix_operational.finance_daily_progress(singleton,civil_day) values(true,d)
 on conflict(singleton) do nothing;
 select * into progress from altnix_operational.finance_daily_progress where singleton for update;
 -- Não voltar o cursor para trás se o relógio do ambiente regredir.
 if progress.civil_day>d then return null;end if;
 if progress.civil_day<d then
  update altnix_operational.finance_daily_progress set civil_day=d,last_service_id=null,completed=false,
   processed=0,queued=0,review_count=0,updated_at=statement_timestamp() where singleton returning * into progress;
 end if;
 if progress.completed then
  return jsonb_build_object('status','ok','processed',0,'queued',0,'review',0,'complete',true);
 end if;
 cursor_id:=progress.last_service_id;
 for item in select * from public.altnix_reassess_service_finance_batch(null,progress.last_service_id,p_limit)
 loop
  cursor_id:=item.service_id;
  n:=n+1;
  if item.outcome='queued' then q:=q+1;end if;
  if item.outcome in ('review','manual_required') then r:=r+1;end if;
 end loop;
 update altnix_operational.finance_daily_progress set last_service_id=cursor_id,completed=(n<p_limit),
  processed=processed+n,queued=queued+q,review_count=review_count+r,updated_at=statement_timestamp() where singleton;
 return jsonb_build_object('status','ok','processed',n,'queued',q,'review',r,'complete',n<p_limit);
end;$daily$;
revoke all on function public.altnix_run_daily_service_finance(integer) from public,anon,authenticated;
grant execute on function public.altnix_run_daily_service_finance(integer) to service_role;
