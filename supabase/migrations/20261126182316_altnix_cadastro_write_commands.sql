-- Preparação sem grants reais. Reaproveita clients, autorização digital e
-- audit_events. Escrita parcial porque save_client substitui todo cadastro/papéis.
begin;
create table public.altnix_client_write_grants (
 tenant_id uuid not null,
 advertiser_id uuid not null,
 actor_id uuid not null,
 client_id uuid not null references public.clients(id) on delete restrict,
 enabled boolean not null default false,
 primary key(tenant_id, advertiser_id, actor_id, client_id)
);
create table public.altnix_client_write_operations (
 operation_id uuid primary key,
 tenant_id uuid not null,
 advertiser_id uuid not null,
 actor_id uuid not null,
 client_id uuid not null references public.clients(id) on delete restrict,
 request_hash text not null,
 result_updated_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.altnix_client_write_grants enable row level security;
alter table public.altnix_client_write_operations enable row level security;
revoke all on public.altnix_client_write_grants,public.altnix_client_write_operations from public,anon,authenticated,service_role;
-- Nenhuma autorização implícita por possuir vínculo de leitura. Provisionamento
-- explícito pelo proprietário em etapa futura; ator Altnix não é perfil Jornal.

create function public.apply_altnix_client_update(
 p_operation_id uuid,p_tenant_id uuid,p_advertiser_id uuid,p_actor_id uuid,p_client_id uuid,
 p_expected_updated_at timestamptz,p_patch jsonb
) returns timestamptz language plpgsql security definer set search_path='' as $altnix_write$
declare
 v_client public.clients%rowtype;
 v_previous public.altnix_client_write_operations%rowtype;
 v_hash text;
 v_updated timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'permission denied' using errcode='42501'; end if;
 if p_operation_id is null or p_tenant_id is null or p_advertiser_id is null or p_actor_id is null or p_client_id is null or p_expected_updated_at is null or p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then
  raise exception 'invalid command' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_each(p_patch) e where e.key not in ('name','tradeName','phone','whatsapp','email','postalCode','street','number','complement') or jsonb_typeof(e.value) not in ('string','null') or length(e.value#>>'{}')>300) then
  raise exception 'invalid fields' using errcode='22023';
 end if;
 if (p_patch?'name' and nullif(btrim(p_patch->>'name'),'') is null)
 or (p_patch?'whatsapp' and p_patch->>'whatsapp' is not null and p_patch->>'whatsapp' !~ '^[0-9]{10,11}$')
 or (p_patch?'phone' and p_patch->>'phone' is not null and p_patch->>'phone' !~ '^[0-9]{10,11}$')
 or (p_patch?'email' and p_patch->>'email' is not null and p_patch->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
 or (p_patch?'postalCode' and p_patch->>'postalCode' is not null and p_patch->>'postalCode' !~ '^[0-9]{8}$') then
  raise exception 'invalid contact' using errcode='22023';
 end if;
 -- Serializa o mesmo operation_id mesmo quando o payload/cliente muda.
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 select * into v_client from public.clients where id=p_client_id for update;
 if not found or v_client.status<>'active' then raise exception 'permission denied' using errcode='42501'; end if;
 perform 1 from public.client_digital_export_permissions where client_id=p_client_id and enabled for share;
 if not found then raise exception 'permission denied' using errcode='42501'; end if;
 perform 1 from public.altnix_client_write_grants where tenant_id=p_tenant_id and advertiser_id=p_advertiser_id and actor_id=p_actor_id and client_id=p_client_id and enabled for share;
 if not found then raise exception 'permission denied' using errcode='42501'; end if;
 v_hash=encode(sha256(convert_to(jsonb_build_object('tenant',p_tenant_id,'advertiser',p_advertiser_id,'actor',p_actor_id,'client',p_client_id,'expected',p_expected_updated_at,'patch',p_patch)::text,'UTF8')),'hex');
 select * into v_previous from public.altnix_client_write_operations where operation_id=p_operation_id;
 if found then
  if v_previous.request_hash<>v_hash then raise exception 'operation conflict' using errcode='23505'; end if;
  return v_previous.result_updated_at;
 end if;
 if v_client.updated_at is distinct from p_expected_updated_at then raise exception 'stale version' using errcode='40001'; end if;
 if v_client.kind='individual' and p_patch?'tradeName' and p_patch->>'tradeName' is not null then raise exception 'invalid individual trade name' using errcode='22023'; end if;
 -- Exclusivamente campos comuns. Nunca tocar documento, cidade/UF/IBGE,
 -- papéis, campos fiscais, aniversários, contratos ou status.
 update public.clients set
  full_name=case when kind='individual' and p_patch?'name' then btrim(p_patch->>'name') else full_name end,
  company_name=case when kind='company' and p_patch?'name' then btrim(p_patch->>'name') else company_name end,
  trade_name=case when kind='company' and p_patch?'tradeName' then p_patch->>'tradeName' else trade_name end,
  phone_primary=case when p_patch?'phone' then p_patch->>'phone' else phone_primary end,
  whatsapp=case when p_patch?'whatsapp' then p_patch->>'whatsapp' else whatsapp end,
  email=case when p_patch?'email' then p_patch->>'email' else email end,
  address_zip=case when p_patch?'postalCode' then p_patch->>'postalCode' else address_zip end,
  address_street=case when p_patch?'street' then p_patch->>'street' else address_street end,
  address_number=case when p_patch?'number' then p_patch->>'number' else address_number end,
  address_complement=case when p_patch?'complement' then p_patch->>'complement' else address_complement end,
  updated_at=clock_timestamp()
 where id=p_client_id returning updated_at into v_updated;
 insert into public.altnix_client_write_operations(operation_id,tenant_id,advertiser_id,actor_id,client_id,request_hash,result_updated_at)
 values(p_operation_id,p_tenant_id,p_advertiser_id,p_actor_id,p_client_id,v_hash,v_updated);
 insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
 values(null,'client',p_client_id,'altnix_cadastro_update',jsonb_build_object('origin','altnix_informativo','operation_id',p_operation_id,'actor_id',p_actor_id,'advertiser_id',p_advertiser_id,'tenant_id',p_tenant_id,'fields',(select jsonb_agg(key order by key) from jsonb_object_keys(p_patch) key)));
 return v_updated;
end;
$altnix_write$;
revoke all on function public.apply_altnix_client_update(uuid,uuid,uuid,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.apply_altnix_client_update(uuid,uuid,uuid,uuid,uuid,timestamptz,jsonb) to service_role;
commit;
