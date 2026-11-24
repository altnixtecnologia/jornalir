\set ON_ERROR_STOP on
-- Banco PostgreSQL DESCARTÁVEL de CI. Não executar este fixture no Supabase oficial.
create schema if not exists auth;
do $setup$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end;
$setup$;
create function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('test.actor_id', true),'')::uuid;
$fn$;
create function auth.role() returns text language sql stable as $fn$
  select 'service_role';
$fn$;

-- Família: stubs mínimos somente para exercitar inclusão e privilégios.
create table public.clients (
  id uuid primary key,
  family_members_confirmed_empty boolean not null default true
);
create table public.birthday_entries (
  id uuid primary key default gen_random_uuid(),
  group_client_id uuid,
  origin text,
  display_name text,
  relationship text,
  birth_month int,
  birth_day int,
  consent_status text,
  publish_in_print boolean,
  active boolean not null default true
);
create function public.require_verified_client_completion(text,uuid)
returns uuid language sql as $fn$
  select '00000000-0000-4000-8000-000000000011'::uuid;
$fn$;
\ir ../../supabase/migrations/20261124174927_client_completion_family_empty_consistency_20261124.sql

insert into public.clients(id,family_members_confirmed_empty)
values ('00000000-0000-4000-8000-000000000011',true);
select public.public_complete_add_family_member(
  'token-autorizado-sandbox','00000000-0000-4000-8000-000000000012',
  'Pessoa de teste','filho',5,23,false
);
do $assert$
begin
  if exists(select 1 from public.clients where family_members_confirmed_empty) then
    raise exception 'Erro: adicionar familiar não limpou a confirmação sem familiares';
  end if;
  if not exists(select 1 from public.birthday_entries
    where display_name='Pessoa de teste' and consent_status='pending'
      and publish_in_print=false) then
    raise exception 'Erro: publicou aniversário sem consentimento';
  end if;
  if has_function_privilege('anon',
    'public.public_complete_add_family_member(text,uuid,text,text,integer,integer,boolean)', 'EXECUTE')
    or has_function_privilege('authenticated',
    'public.public_complete_add_family_member(text,uuid,text,text,integer,integer,boolean)', 'EXECUTE') then
    raise exception 'Erro: função pública acessível por usuário não privilegiado';
  end if;
  if not has_function_privilege('service_role',
    'public.public_complete_add_family_member(text,uuid,text,text,integer,integer,boolean)', 'EXECUTE') then
    raise exception 'Erro: serviço não pode adicionar familiar verificado';
  end if;
end;
$assert$;

-- Auditoria: operação autenticada com IDs fictícios.
create table public.audit_events (
  user_id uuid, entity_type text, entity_id uuid, action text, metadata jsonb
);
create table public.staff_finance_action_permissions (
  profile_id uuid, action_key text, allowed boolean,
  primary key (profile_id,action_key)
);
create table public.staff_module_visibility (
  profile_id uuid, module_key text, enabled boolean,
  primary key (profile_id,module_key)
);
\ir ../../supabase/migrations/20261124174932_audit_finance_and_visibility_permissions_20261124.sql
select set_config('test.actor_id','00000000-0000-4000-8000-000000000021',false);
insert into public.staff_finance_action_permissions
values ('00000000-0000-4000-8000-000000000022','pix_cancelar',true);
update public.staff_finance_action_permissions set allowed=true where action_key='pix_cancelar';
update public.staff_finance_action_permissions set allowed=false where action_key='pix_cancelar';
insert into public.staff_module_visibility
values ('00000000-0000-4000-8000-000000000022','editorial',false);
update public.staff_module_visibility set enabled=true where module_key='editorial';
update public.staff_module_visibility set enabled=false where module_key='editorial';
do $assert$
begin
  if (select count(*) from public.audit_events) <> 4 then
    raise exception 'Erro: esperado 4 eventos reais e nenhum evento idempotente';
  end if;
  if (select count(*) from public.audit_events
      where user_id='00000000-0000-4000-8000-000000000021') <> 4 then
    raise exception 'Erro: ator da auditoria divergente';
  end if;
  if (select count(*) from public.audit_events
      where metadata->>'module_key'='financeiro'
        and metadata->>'critical'='true') <> 2 then
    raise exception 'Erro: concessão e revogação críticas não auditadas';
  end if;
  if (select count(*) from public.audit_events
      where metadata->>'action_key'='visibilidade_modulo') <> 2 then
    raise exception 'Erro: habilitar/desabilitar módulo não auditado';
  end if;
  if (select count(*) from public.audit_events where
      (action='grant' and metadata->>'previous_allowed'='false' and metadata->>'allowed'='true')
      or (action='revoke' and metadata->>'previous_allowed'='true' and metadata->>'allowed'='false')) <> 4 then
    raise exception 'Erro: valores antes/depois da auditoria divergentes';
  end if;
end;
$assert$;

-- Notificações: migração adiciona um campo e preserva os dados anteriores.
create table public.site_notification_reads (
  management_hash text not null,
  event_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (management_hash,event_id)
);
insert into public.site_notification_reads (management_hash,event_id)
values (repeat('a',64),'00000000-0000-4000-8000-000000000031');
\ir ../../supabase/migrations/20261124174937_site_notifications_dismissed_per_device_20261124.sql
do $assert$
begin
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='site_notification_reads' and column_name='dismissed_at'
  ) then
    raise exception 'Erro: campo de limpeza por dispositivo não criado';
  end if;
  if (select count(*) from public.site_notification_reads where dismissed_at is null) <> 1 then
    raise exception 'Erro: registros antigos não foram preservados';
  end if;
end;
$assert$;
select 'sandbox OK: 3 migrações versionadas, sem dados reais' as resultado;
