-- Cadastro novo: usa a RPC oficial save_client, sem criar venda/contrato.
-- Nenhuma autorização concedida nem registro real criado pela migration.
begin;
create table public.altnix_client_create_grants (
 tenant_id uuid not null,actor_id uuid not null,enabled boolean not null default false,
 primary key(tenant_id,actor_id)
);
alter table public.altnix_client_create_grants enable row level security;
revoke all on public.altnix_client_create_grants from public,anon,authenticated,service_role;
alter table public.altnix_client_write_operations add column operation_kind text not null default 'update' check(operation_kind in ('update','create'));
create unique index altnix_cadastro_create_anchor_uidx on public.altnix_client_write_operations(tenant_id,advertiser_id) where operation_kind='create';
create function public.apply_altnix_client_create(
 p_operation_id uuid,p_tenant_id uuid,p_advertiser_id uuid,p_actor_id uuid,p_client jsonb
) returns uuid language plpgsql security definer set search_path='' as $create_client$
declare v_id uuid;v_version timestamptz;v_hash text;v_previous public.altnix_client_write_operations%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'permission denied' using errcode='42501';end if;
 if p_operation_id is null or p_tenant_id is null or p_advertiser_id is null or p_actor_id is null or p_client is null or jsonb_typeof(p_client)<>'object' then raise exception 'invalid command' using errcode='22023';end if;
 perform 1 from public.altnix_client_create_grants where tenant_id=p_tenant_id and actor_id=p_actor_id and enabled for share;
 if not found then raise exception 'permission denied' using errcode='42501';end if;
 if exists(select 1 from jsonb_each(p_client) e where e.key not in ('kind','status','full_name','company_name','trade_name','cpf','cnpj','phone_primary','whatsapp','email','address_zip','address_street','address_number','address_complement','address_city','address_state') or jsonb_typeof(e.value) not in ('string','null') or length(e.value#>>'{}')>300) then raise exception 'invalid fields' using errcode='22023';end if;
 if coalesce(p_client->>'status','')<>'active' or coalesce(p_client->>'kind','') not in ('individual','company') or coalesce(p_client->>'whatsapp','') !~ '^[0-9]{10,11}$' or coalesce(p_client->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid contact' using errcode='22023';end if;
 if p_client->>'kind'='individual' then
  if nullif(btrim(p_client->>'full_name'),'') is null or coalesce(p_client->>'cpf','') !~ '^[0-9]{11}$' or p_client->>'cnpj' is not null or p_client->>'company_name' is not null or p_client->>'trade_name' is not null then raise exception 'invalid identity' using errcode='22023';end if;
 else
  if nullif(btrim(p_client->>'company_name'),'') is null or coalesce(p_client->>'cnpj','') !~ '^[A-Z0-9]{12}[0-9]{2}$' or p_client->>'cpf' is not null or p_client->>'full_name' is not null then raise exception 'invalid identity' using errcode='22023';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 v_hash=encode(sha256(convert_to(jsonb_build_object('kind','create','tenant',p_tenant_id,'advertiser',p_advertiser_id,'actor',p_actor_id,'client',p_client)::text,'UTF8')),'hex');
 select * into v_previous from public.altnix_client_write_operations where operation_id=p_operation_id;
 if found then
  if v_previous.operation_kind<>'create' or v_previous.request_hash<>v_hash then raise exception 'operation conflict' using errcode='23505';end if;
  perform 1 from public.client_digital_export_permissions where client_id=v_previous.client_id and enabled for share;
  if not found then raise exception 'permission denied' using errcode='42501';end if;
  return v_previous.client_id;
 end if;
 -- Mesmo documento ou âncora já existente nunca é reassociado implicitamente.
 -- Índices únicos do cadastro e da âncora são a barreira transacional.
 v_id:=public.save_client(null,p_client,array['anunciante']::text[]);
 select updated_at into strict v_version from public.clients where id=v_id;
 -- O grant de criação é autorização explícita para compartilhar o novo
 -- cadastro criado para Informativo; nunca concede edição de cliente existente.
 insert into public.client_digital_export_permissions(client_id,enabled) values(v_id,true);
 insert into public.altnix_client_write_operations(operation_id,tenant_id,advertiser_id,actor_id,client_id,request_hash,result_updated_at,operation_kind)
 values(p_operation_id,p_tenant_id,p_advertiser_id,p_actor_id,v_id,v_hash,v_version,'create');
 insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
 values(null,'client',v_id,'altnix_cadastro_create',jsonb_build_object('origin','altnix_informativo','operation_id',p_operation_id,'actor_id',p_actor_id,'advertiser_id',p_advertiser_id,'tenant_id',p_tenant_id));
 return v_id;
end;
$create_client$;
revoke all on function public.apply_altnix_client_create(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_altnix_client_create(uuid,uuid,uuid,uuid,jsonb) to service_role;
commit;
