-- CANDIDATO EXCLUSIVAMENTE PARA SANDBOX; NÃO É MIGRATION.
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
 local_contract_id uuid not null unique,
 campaign_id uuid not null unique,
 approved_by uuid not null,
 approved_at timestamptz not null default now(),
 enabled boolean not null default false
);
create table altnix_operational.service_outbox(
 event_id uuid primary key,
 service_id uuid not null references altnix_operational.service_binding(service_id) on delete restrict,
 revision bigint not null check(revision between 1 and 9007199254740991),
 payload jsonb not null,
 decision_actor uuid not null,
 decision_reason text not null check(length(btrim(decision_reason)) between 1 and 500),
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 unique(service_id,revision)
);
alter table altnix_operational.service_binding enable row level security;
alter table altnix_operational.service_outbox enable row level security;
revoke all on altnix_operational.service_binding,altnix_operational.service_outbox from public,anon,authenticated,service_role;
grant select on altnix_operational.service_binding,altnix_operational.service_outbox to service_role;
grant insert on altnix_operational.service_outbox to service_role;
grant update(delivered_at) on altnix_operational.service_outbox to service_role;
create policy binding_read on altnix_operational.service_binding for select to service_role using(true);
create policy outbox_read on altnix_operational.service_outbox for select to service_role using(true);
create policy outbox_append on altnix_operational.service_outbox for insert to service_role with check(true);
create policy outbox_ack on altnix_operational.service_outbox for update to service_role using(true) with check(true);
-- O chamador futuro deve ser servidor autorizado, com decisão explícita auditada.
-- Nenhuma regra de autorização pode ser deduzida de um pagamento global.
create function public.altnix_queue_service_authorization(
 p_service uuid,p_event uuid,p_actor uuid,p_state text,p_effective timestamptz,p_reason text
) returns jsonb language plpgsql security invoker set search_path='' as $queue$
declare b altnix_operational.service_binding%rowtype; old altnix_operational.service_outbox%rowtype; rev bigint; payload jsonb;
begin
 if p_event is null or p_actor is null or p_service is null or p_state is null or p_state not in ('authorized','grace','suspended','ended')
 or p_effective is null or p_effective>statement_timestamp() or p_reason is null or length(btrim(p_reason)) not between 1 and 500 then return null;end if;
 -- Serializar evento e serviço sem permissões de UPDATE sobre vínculo.
 perform pg_advisory_xact_lock(hashtextextended('altnix-service:'||p_service::text,0));
 select * into b from altnix_operational.service_binding where service_id=p_service and enabled;
 if not found then return null;end if;
 if not exists(select 1 from public.commercial_contract_services s join public.commercial_contract_packages p on p.id=s.package_id
 join public.commercial_sales v on v.id=p.commercial_sale_id
 join public.client_digital_export_permissions e on e.client_id=p.client_id and e.enabled
 where s.id=b.service_id and p.id=b.package_id and p.client_id=b.client_id and v.client_id=b.client_id and s.service_channel='led_panel') then return null;end if;
 select * into old from altnix_operational.service_outbox where event_id=p_event;
 if found then
  if old.service_id=p_service and old.decision_actor=p_actor and old.decision_reason=p_reason
   and old.payload->>'status'=p_state and (old.payload->>'effectiveAt')::timestamptz=p_effective then return old.payload;end if;
  return null;
 end if;
 select coalesce(max(o.revision),0)+1 into rev from altnix_operational.service_outbox o where o.service_id=p_service;
 payload=jsonb_build_object('origin','jornal_ir','contractVersion','1','serviceCode','altnix_informativo',
 'tenantId','00000000-0000-0000-0000-000000000001','advertiserId',b.advertiser_id,'canonicalClientId',b.client_id,
 'canonicalContractId',b.package_id,'canonicalServiceId',b.service_id,'localContractId',b.local_contract_id,
 'campaignId',b.campaign_id,'eventId',p_event,'revision',rev,'status',p_state,
 'effectiveAt',to_char(p_effective at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 insert into altnix_operational.service_outbox(event_id,service_id,revision,payload,decision_actor,decision_reason)
 values(p_event,p_service,rev,payload,p_actor,p_reason);
 return payload;
 exception when unique_violation then return null;
end;$queue$;
revoke all on function public.altnix_queue_service_authorization(uuid,uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.altnix_queue_service_authorization(uuid,uuid,uuid,text,timestamptz,text) to service_role;
