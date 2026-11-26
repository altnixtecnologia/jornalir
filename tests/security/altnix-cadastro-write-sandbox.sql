-- Banco descartável, nunca produção. Simula somente dependências da RPC.
create schema auth;
create role anon; create role authenticated; create role service_role;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
create table public.clients(id uuid primary key,kind text not null,status text not null,full_name text,company_name text,trade_name text,phone_primary text,whatsapp text,email text,address_zip text,address_street text,address_number text,address_complement text,address_city text,address_state text,address_ibge_code text,cpf text,cnpj text,fiscal_email text,updated_at timestamptz not null);
create table public.client_roles(client_id uuid,role text);
create table public.client_digital_export_permissions(client_id uuid primary key,enabled boolean not null);
create table public.audit_events(user_id uuid,entity_type text,entity_id uuid,action text,metadata jsonb);
\ir ../../supabase/migrations/20261126170000_altnix_cadastro_write_commands.sql
insert into public.clients(id,kind,status,company_name,whatsapp,email,address_city,address_state,address_ibge_code,cnpj,fiscal_email,updated_at) values('11111111-1111-4111-8111-111111111111','company','active','Empresa','48999999999','a@example.test','Praia Grande','SC','4213807','11222333000181','fiscal@example.test','2026-11-26 12:00:00+00');
insert into public.client_roles values('11111111-1111-4111-8111-111111111111','anunciante');
insert into public.client_digital_export_permissions values('11111111-1111-4111-8111-111111111111',true);
do $test$
declare c uuid:='11111111-1111-4111-8111-111111111111'; t uuid:='22222222-2222-4222-8222-222222222222'; a uuid:='33333333-3333-4333-8333-333333333333'; u uuid:='44444444-4444-4444-8444-444444444444'; op uuid:='55555555-5555-4555-8555-555555555555'; ts timestamptz:='2026-11-26 12:00:00+00'; v timestamptz; w timestamptz;
begin
 if has_function_privilege('authenticated','public.apply_altnix_client_update(uuid,uuid,uuid,uuid,uuid,timestamptz,jsonb)','execute') then raise exception 'authenticated can execute';end if;
 perform set_config('request.jwt.claim.role','authenticated',true);
 begin perform public.apply_altnix_client_update(op,t,a,u,c,ts,'{"name":"Novo"}');raise exception 'unauthorized passed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.role','service_role',true);
 begin perform public.apply_altnix_client_update(op,t,a,u,c,ts,'{"name":"Novo"}');raise exception 'grant absent passed';exception when insufficient_privilege then null;end;
 insert into public.altnix_client_write_grants values(t,a,u,c,true);
 v:=public.apply_altnix_client_update(op,t,a,u,c,ts,'{"name":"Novo","whatsapp":"48988887777"}');
 w:=public.apply_altnix_client_update(op,t,a,u,c,ts,'{"whatsapp":"48988887777","name":"Novo"}');
 if v is distinct from w then raise exception 'retry changed result';end if;
 if (select count(*) from public.audit_events)<>1 or (select count(*) from public.altnix_client_write_operations)<>1 then raise exception 'duplicate audit';end if;
 if not exists(select 1 from public.clients where id=c and company_name='Novo' and whatsapp='48988887777' and cnpj='11222333000181' and fiscal_email='fiscal@example.test' and address_ibge_code='4213807' and address_city='Praia Grande') or not exists(select 1 from public.client_roles where client_id=c and role='anunciante') then raise exception 'exclusive fields changed';end if;
 begin perform public.apply_altnix_client_update(op,t,a,u,c,ts,'{"name":"Different"}');raise exception 'operation reuse passed';exception when unique_violation then null;end;
 begin perform public.apply_altnix_client_update(gen_random_uuid(),t,a,u,c,ts,'{"name":"Stale"}');raise exception 'stale passed';exception when serialization_failure then null;end;
 begin perform public.apply_altnix_client_update(gen_random_uuid(),t,a,u,c,v,'{"document":"x"}');raise exception 'forbidden field passed';exception when invalid_parameter_value then null;end;
 update public.client_digital_export_permissions set enabled=false where client_id=c;
 begin perform public.apply_altnix_client_update(gen_random_uuid(),t,a,u,c,v,'{"name":"Revoked"}');raise exception 'revoked passed';exception when insufficient_privilege then null;end;
end;
$test$;
