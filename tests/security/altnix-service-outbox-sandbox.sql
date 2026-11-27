-- Banco descartável, sem dados ou serviços reais.
do $roles$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role;end if;
end;$roles$;
create table public.clients(id uuid primary key);
create table public.commercial_sales(id uuid primary key,client_id uuid not null,status text default 'active',commercial_condition text default 'installments',amount numeric default 100,installments_count integer default 1,items_snapshot jsonb default '[{"serviceChannel":"led_panel"}]'::jsonb);
create table public.commercial_contract_packages(id uuid primary key,client_id uuid not null,commercial_sale_id uuid not null);
create table public.commercial_contract_services(id uuid primary key,package_id uuid not null,service_channel text not null,starts_on date default current_date-30,ends_on date);
create table public.receivables_with_balance(id uuid primary key,client_id uuid,commercial_sale_id uuid,installment_number integer,original_amount numeric,balance numeric,status text,due_date date);
create table public.client_digital_export_permissions(client_id uuid primary key,enabled boolean not null);
grant select on public.receivables_with_balance,public.clients,public.commercial_sales,public.commercial_contract_packages,public.commercial_contract_services,public.client_digital_export_permissions to service_role;
\ir fixtures/altnix-service-outbox-candidate.sql
insert into public.clients values('00000000-0000-4000-8000-000000000001');
insert into public.commercial_sales(id,client_id) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
insert into public.commercial_contract_packages values('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
insert into public.commercial_contract_services(id,package_id,service_channel) values('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','led_panel'),('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000003','newspaper');
insert into public.client_digital_export_permissions values('00000000-0000-4000-8000-000000000001',true);
insert into altnix_operational.service_binding(service_id,package_id,client_id,advertiser_id,campaign_id,approved_by,enabled)
values('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),true),
('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),true);
do $acl$ begin
 if has_schema_privilege('authenticated','altnix_operational','USAGE') or has_column_privilege('service_role','altnix_operational.service_binding','enabled','INSERT') or has_column_privilege('service_role','altnix_operational.service_outbox','payload','UPDATE') or has_function_privilege('anon','public.altnix_queue_service_authorization(uuid,uuid,uuid,text,timestamptz,text,text)','EXECUTE') then raise exception 'unsafe privilege';end if;
end;$acl$;
-- Novo serviço sem contrato espelho, reserva e confirmação em duas fases.
insert into public.commercial_contract_services(id,package_id,service_channel) values('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000003','led_panel');
set role service_role;
do $binding$ declare s uuid:='00000000-0000-4000-8000-000000000006'; a uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();p jsonb;
begin
 if public.altnix_service_binding_context(s)->>'clientId' is null then raise exception 'context missing';end if;
 p=public.altnix_prepare_service_binding(s,a,c,actor);
 if p is null or p->>'campaignId'<>c::text then raise exception 'reserve failed';end if;
 if (public.altnix_service_binding_context(s)->>'campaignId') is distinct from c::text then raise exception 'reserved context missing';end if;
 if (public.altnix_read_service_authorization(s)->>'enabled') is distinct from 'false' then raise exception 'enabled before remote confirmation';end if;
 if public.altnix_queue_service_authorization(s,gen_random_uuid(),actor,'authorized',now(),'must remain disabled') is not null then raise exception 'premature authorization';end if;
 if public.altnix_prepare_service_binding(s,a,c,actor) is distinct from p then raise exception 'reservation retry failed';end if;
 if public.altnix_prepare_service_binding(s,a,gen_random_uuid(),actor) is not null then raise exception 'binding replaced';end if;
 if public.altnix_confirm_service_binding(s,a,c,gen_random_uuid()) then raise exception 'wrong actor confirmed';end if;
 if not public.altnix_confirm_service_binding(s,a,c,actor) then raise exception 'confirm failed';end if;
 if (public.altnix_read_service_authorization(s)->>'enabled') is distinct from 'true' then raise exception 'confirmation not saved';end if;
end;$binding$;
do $test$ declare s uuid:='00000000-0000-4000-8000-000000000004'; other uuid:='00000000-0000-4000-8000-000000000005';e uuid:=gen_random_uuid();a uuid:=gen_random_uuid();d timestamptz:=now();p jsonb;q jsonb;begin
 p=public.altnix_queue_service_authorization(s,e,a,'authorized',d,'explicit test decision');
 if p is null or p?'localContractId' or p->>'revision'<>'1' or p->>'canonicalServiceId'<>s::text then raise exception 'valid event missing';end if;
 q=public.altnix_queue_service_authorization(s,e,a,'authorized',null,'explicit test decision');
 if q is distinct from p then raise exception 'retry generated new event';end if;
 if public.altnix_queue_service_authorization(s,e,a,'suspended',d,'changed decision') is not null then raise exception 'conflicting replay';end if;
 if public.altnix_queue_service_authorization(other,gen_random_uuid(),a,'authorized',d,'wrong service') is not null then raise exception 'newspaper accepted';end if;
 q=public.altnix_queue_service_authorization(s,gen_random_uuid(),a,'suspended',d,'second decision');
 if q is null or q->>'revision'<>'2' then raise exception 'revision missing';end if;
 if (select count(*) from altnix_operational.service_outbox)<>2 then raise exception 'duplicate';end if;
 if (public.altnix_read_service_authorization(s)->>'status') is distinct from 'suspended' or (public.altnix_read_service_authorization(s)->>'delivery') is distinct from 'pending' then raise exception 'status projection incorrect';end if;
end;$test$;
do $claim_test$ declare r record;begin
 select * into r from public.altnix_claim_service_authorizations(5);
 if not found or r.payload->>'revision'<>'2' or r.payload->>'status'<>'suspended' then raise exception 'latest revision not claimed';end if;
 if exists(select 1 from public.altnix_claim_service_authorizations(5)) then raise exception 'double claim';end if;
 if public.altnix_finish_service_authorization(r.event_id,gen_random_uuid(),'applied') then raise exception 'wrong claim token';end if;
 if not public.altnix_finish_service_authorization(r.event_id,r.claim_token,'applied') then raise exception 'ack failed';end if;
 if public.altnix_finish_service_authorization(r.event_id,r.claim_token,'applied') then raise exception 'repeated ack';end if;
 if exists(select 1 from public.altnix_claim_service_authorizations(5)) then raise exception 'superseded revision dispatched';end if;
 if (public.altnix_read_service_authorization((r.payload->>'canonicalServiceId')::uuid)->>'delivery') is distinct from 'confirmed' then raise exception 'confirmed status missing';end if;
end;$claim_test$;
reset role;
update public.client_digital_export_permissions set enabled=false;
set role service_role;
do $revoked$ begin
 if public.altnix_queue_service_authorization('00000000-0000-4000-8000-000000000004',gen_random_uuid(),gen_random_uuid(),'authorized',now(),'revoked') is not null then raise exception 'revoked accepted';end if;
end;$revoked$;
reset role;
select 'outbox sandbox OK' as result;

-- Financeiro real: cenários de venda de serviço único e pacote misto.
insert into public.clients values('00000000-0000-4000-8000-000000000021');
insert into public.client_digital_export_permissions values('00000000-0000-4000-8000-000000000021',true);
insert into public.commercial_sales(id,client_id) values('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000021');
insert into public.commercial_contract_packages values('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022');
insert into public.commercial_contract_services(id,package_id,service_channel) values('00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000023','led_panel');
do $evidence$ declare s uuid:='00000000-0000-4000-8000-000000000024';v uuid:='00000000-0000-4000-8000-000000000022';c uuid:='00000000-0000-4000-8000-000000000021';d date:=(now() at time zone 'America/Sao_Paulo')::date;begin
 if (public.altnix_assess_service_finance(s,2)->>'reason') is distinct from 'billing_incomplete' then raise exception 'missing billing accepted';end if;
 insert into public.receivables_with_balance values(gen_random_uuid(),c,v,1,100,50,'partially_paid',d-1);
 if (public.altnix_assess_service_finance(s,2)->>'state') is distinct from 'grace' then raise exception 'grace not honored';end if;
 if (public.altnix_assess_service_finance(s,0)->>'state') is distinct from 'suspended' then raise exception 'overdue not suspended';end if;
 update public.receivables_with_balance set balance=0,status='paid' where commercial_sale_id=v;
 if (public.altnix_assess_service_finance(s,2)->>'state') is distinct from 'authorized' then raise exception 'paid balance not recognized';end if;
 update public.receivables_with_balance set balance=50,status='paid' where commercial_sale_id=v;
 if (public.altnix_assess_service_finance(s,2)->>'state') is distinct from 'review' then raise exception 'inconsistent receipt accepted';end if;
 update public.receivables_with_balance set status='open',balance=100,due_date=d+10 where commercial_sale_id=v;
 if (public.altnix_assess_service_finance(s,2)->>'state') is distinct from 'authorized' then raise exception 'future due date overdue';end if;
 update public.commercial_sales set commercial_condition='courtesy' where id=v;
 if (public.altnix_assess_service_finance(s,2)->>'reason') is distinct from 'non_monetary_or_undefined' then raise exception 'courtesy treated as debt';end if;
 update public.commercial_sales set commercial_condition='cash',items_snapshot='[{"serviceChannel":"led_panel"},{"serviceChannel":"newspaper"}]' where id=v;
 if (public.altnix_assess_service_finance(s,2)->>'reason') is distinct from 'allocation_not_proven' then raise exception 'mixed sale attributed';end if;
 update public.commercial_sales set status='cancelled' where id=v;
 if (public.altnix_assess_service_finance(s,2)->>'state') is distinct from 'ended' then raise exception 'cancelled sale still active';end if;
end;$evidence$;

-- Política automática opt-in: reavalia saldo, preserva decisão manual, sem duplicar.
do $auto$ declare s uuid:='00000000-0000-4000-8000-000000000024';v uuid:='00000000-0000-4000-8000-000000000022';a uuid:=gen_random_uuid();ca uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();d date:=(now() at time zone 'America/Sao_Paulo')::date; p jsonb; outcome text; observed text;begin
 update public.commercial_sales set status='active',commercial_condition='cash',items_snapshot='[{"serviceChannel":"led_panel"}]' where id=v;
 update public.receivables_with_balance set status='open',balance=100,due_date=d+2 where commercial_sale_id=v;
 if public.altnix_prepare_service_binding(s,a,ca,actor) is null or not public.altnix_confirm_service_binding(s,a,ca,actor) then raise exception 'auto fixture binding failed';end if;
 if public.altnix_configure_service_finance(s,actor,2) then raise exception 'automation without human release';end if;
 p=public.altnix_queue_service_authorization(s,gen_random_uuid(),actor,'authorized',null,'human release');
 if p is null or public.altnix_apply_service_finance(s)<>'disabled' then raise exception 'automation default not disabled';end if;
 if not public.altnix_configure_service_finance(s,actor,2) then raise exception 'explicit policy rejected';end if;
 update public.receivables_with_balance set due_date=d-1 where commercial_sale_id=v;
 -- Execute mutation and stable reader in separate SQL statements (fresh MVCC snapshot).
 outcome:=public.altnix_apply_service_finance(s);
 observed:=public.altnix_read_service_authorization(s)->>'status';
 if outcome is distinct from 'queued' or observed is distinct from 'grace' then raise exception 'automatic grace missing: outcome=%, status=%',outcome,observed;end if;
 if public.altnix_apply_service_finance(s)<>'unchanged' then raise exception 'duplicate finance event';end if;
 update public.receivables_with_balance set due_date=d-3 where commercial_sale_id=v;
 -- Execute mutation and stable reader in separate SQL statements (fresh MVCC snapshot).
 outcome:=public.altnix_apply_service_finance(s);
 observed:=public.altnix_read_service_authorization(s)->>'status';
 if outcome is distinct from 'queued' or observed is distinct from 'suspended' then raise exception 'automatic suspension missing: outcome=%, status=%',outcome,observed;end if;
 update public.receivables_with_balance set status='paid',balance=0 where commercial_sale_id=v;
 -- Execute mutation and stable reader in separate SQL statements (fresh MVCC snapshot).
 outcome:=public.altnix_apply_service_finance(s);
 observed:=public.altnix_read_service_authorization(s)->>'status';
 if outcome is distinct from 'queued' or observed is distinct from 'authorized' then raise exception 'automatic recovery missing: outcome=%, status=%',outcome,observed;end if;
 p=public.altnix_queue_service_authorization(s,gen_random_uuid(),actor,'suspended',null,'manual suspension');
 if p is null or public.altnix_apply_service_finance(s)<>'manual_required' then raise exception 'manual suspension overwritten';end if;
 update public.commercial_sales set status='cancelled' where id=v;
 -- Execute mutation and stable reader in separate SQL statements (fresh MVCC snapshot).
 outcome:=public.altnix_apply_service_finance(s);
 observed:=public.altnix_read_service_authorization(s)->>'status';
 if outcome is distinct from 'queued' or observed is distinct from 'ended' then raise exception 'cancel not ended: outcome=%, status=%',outcome,observed;end if;
 if public.altnix_apply_service_finance(s)<>'manual_required' then raise exception 'ended reopened';end if;
 if not public.altnix_configure_service_finance(s,actor,null) or public.altnix_apply_service_finance(s)<>'disabled' then raise exception 'disable failed';end if;
end;$auto$;
