-- Assistente IR: configuracao central DESLIGADA por padrao.
-- MIGRATION LOCAL/PENDENTE: nao aplicar em producao sem autorizacao.
-- Nao executa automacoes, IA, cobrancas, cancelamentos ou publicacoes.

create table if not exists public.ai_assistant_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  provider text not null default 'openai' check (provider in ('openai','anthropic')),
  model text not null default 'gpt-4o-mini' check (length(trim(model)) between 1 and 100),
  module_modes jsonb not null default '{"financeiro":"off","clientes":"off","site":"off","editorial":"off","agenda":"off","aniversariantes":"off","contratos":"off","fiscal":"off"}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint ai_assistant_modes_object check (jsonb_typeof(module_modes) = 'object')
);

insert into public.ai_assistant_settings (id) values (1) on conflict (id) do nothing;
alter table public.ai_assistant_settings enable row level security;
revoke all on public.ai_assistant_settings from anon, authenticated;
grant select, update on public.ai_assistant_settings to authenticated;
grant all on public.ai_assistant_settings to service_role;

drop policy if exists ai_settings_owner_read on public.ai_assistant_settings;
create policy ai_settings_owner_read on public.ai_assistant_settings
  for select to authenticated using (public.is_active_owner());
drop policy if exists ai_settings_owner_update on public.ai_assistant_settings;
create policy ai_settings_owner_update on public.ai_assistant_settings
  for update to authenticated using (public.is_active_owner())
  with check (public.is_active_owner());
-- Sem INSERT/DELETE autenticado: somente a linha singleton inicial.

-- Cofre de segredos: sempre ciphertext AES-256-GCM, criptografado na API
-- com AI_CONFIG_ENCRYPTION_KEY. Nenhuma permissao de leitura para o navegador,
-- nem para owner via RLS ou PostgREST com JWT autenticado.
create table if not exists public.ai_provider_credentials (
  provider text primary key check (provider in ('openai','anthropic')),
  encrypted_key text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.ai_provider_credentials enable row level security;
revoke all on public.ai_provider_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.ai_provider_credentials to service_role;
comment on table public.ai_provider_credentials is
  'Chaves de API cifradas: sem grants ou policies para authenticated; acesso apenas server-side service_role.';

-- Caixa de propostas para etapas futuras. Somente LEITURA para admins;
-- nenhuma operacao financeira sera executada a partir desta tabela.
create table if not exists public.ai_approval_requests (
  id uuid primary key default gen_random_uuid(),
  module_key text not null check (module_key in ('financeiro','clientes','site','editorial','agenda','aniversariantes','contratos','fiscal')),
  action_code text not null check (length(trim(action_code)) between 1 and 100),
  title text not null check (length(trim(title)) between 1 and 200),
  rationale text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','failed')),
  context jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  constraint ai_approval_context_object check (jsonb_typeof(context) = 'object')
);
create index if not exists ai_approval_requests_pending_idx
  on public.ai_approval_requests(requested_at desc) where status = 'pending';
alter table public.ai_approval_requests enable row level security;
revoke all on public.ai_approval_requests from anon, authenticated;
grant select on public.ai_approval_requests to authenticated;
grant all on public.ai_approval_requests to service_role;
drop policy if exists ai_approval_read_admin on public.ai_approval_requests;
create policy ai_approval_read_admin on public.ai_approval_requests
  for select to authenticated using (public.is_active_admin_or_owner());
-- Sem INSERT/UPDATE/DELETE autenticado: aprovacoes/execucoes so por
-- endpoints especificos a desenvolver, com checagem de permissao e reautenticacao.
comment on table public.ai_approval_requests is
  'Base de propostas de IA aguardando revisao humana. Nao existe executor nesta etapa.';
