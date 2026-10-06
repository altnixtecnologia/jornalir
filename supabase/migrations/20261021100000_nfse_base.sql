-- NFS-e — Parte 1: base do módulo (configuração fiscal do emissor,
-- perfis de serviço, rascunhos com snapshot). Módulo INDEPENDENTE de
-- Contratos/Assinaturas/Financeiro — nenhuma FK pra essas tabelas aqui
-- (ver docs/NFSE-NACIONAL-ARQUITETURA.md). Incremental sobre
-- 20261020100000_financeiro_contratos_bloco2.sql.
-- Sequência de aplicação:
--   1. 20261011100000_clients.sql
--   2. 20261015100000_subscriptions.sql
--   3. 20261016100000_subscriptions_operational.sql
--   4. 20261017100000_financeiro_contas_a_receber.sql
--   5. 20261018100000_financeiro_geracao_titulos.sql
--   6. 20261019100000_financeiro_credito_cliente.sql
--   7. 20261020100000_financeiro_contratos_bloco2.sql
--   8. esta migration
--
-- IMPORTANTE: NÃO aplicada ainda. Nenhuma migration anterior foi
-- alterada — esta só acrescenta.
--
-- NÃO implementa transmissão real, assinatura digital, XML/DPS
-- definitivo, consulta por chave, eventos de cancelamento/substituição,
-- Asaas, Pix, WhatsApp ou cálculo de IBS/CBS — só a base de domínio.
-- Nenhum código fiscal é um valor inventado: cTribNac/cTribMun/cNBS
-- são sempre `text` livre preenchido pelo usuário, nunca um enum com
-- valores presumidos pela aplicação.
--
-- NUMERAÇÃO: internal_reference (ex.: IR-NFSE-2026-000001) é SÓ uma
-- referência interna de navegação dentro deste sistema — nunca o
-- número fiscal, a chave de acesso ou qualquer identificador oficial
-- da NFS-e. Nosso sistema não inventa numeração fiscal. Número/chave
-- reais só existirão depois da transmissão/autorização pelo Sistema
-- Nacional (Parte 2+), em colunas próprias que ainda não existem.
--
-- PERMISSÃO: só owner/admin operam este módulo (is_active_admin_or_owner(),
-- já usada por gestão de usuários/auditoria) — nunca operator. Ver
-- ajuste pós-revisão, item 6. Reaproveita o mecanismo já existente;
-- nenhuma infraestrutura de permissão nova foi criada. Futuramente a
-- permissão de emitir NFS-e poderá ser configurável por perfil.
--
-- AUDITORIA: reaproveita public.audit_events (já existente desde
-- 20260921101000_audit_events.sql, até então sem nenhum módulo
-- gravando nele) — nunca uma tabela de log nova. A aplicação grava um
-- evento por ação relevante (criação/alteração de configuração fiscal,
-- criação/alteração/ativação/desativação de perfil, criação/alteração
-- de rascunho, atualização de snapshot a partir do cliente), nunca
-- segredo/certificado/senha/chave privada em metadata.

-- ==================================================================
-- 1) CONFIGURAÇÃO FISCAL DO EMISSOR (item 4) — uma única configuração
-- ativa; o provider sempre trabalha com a linha mais recente (`order
-- by updated_at desc limit 1`). Dados sugeridos da Informativo
-- Regional LTDA são só valor inicial sugerido NA APLICAÇÃO (ver
-- NFSE_SUGGESTED_ISSUER_DEFAULTS em @ir/types) — nenhuma linha é
-- inserida automaticamente por esta migration.
-- ==================================================================

create table public.nfse_issuer_configs (
  id uuid primary key default gen_random_uuid(),

  company_name text not null,
  trade_name text,
  cnpj text not null,
  municipal_registration text not null,
  municipality text not null,
  state text not null,
  ibge_code text not null,

  -- Regime tributário geral (ex.: "Simples Nacional") — conceito de
  -- negócio comum, NUNCA um código de tributação da NFS-e. Fica
  -- opcional/vazio até o usuário configurar explicitamente (item 2:
  -- "sem assumir silenciosamente informações tributárias").
  tax_regime text,
  special_tax_regime text,

  environment text not null default 'homologation' check (environment in ('homologation', 'production')),

  -- Metadata do certificado digital — NUNCA o arquivo/senha/chave
  -- privada (item 4D). certificate_reference é só uma referência
  -- segura futura (ex.: id num cofre externo), nunca o segredo em si.
  certificate_type text not null default 'not_configured' check (certificate_type in ('a1', 'a3', 'not_configured')),
  certificate_status text not null default 'not_configured' check (certificate_status in ('not_configured', 'configured')),
  certificate_valid_until date,
  certificate_reference text,

  notes text,

  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.nfse_issuer_configs is
  'Configuração fiscal permanente do emissor de NFS-e — uma única linha ativa (a mais recente). "expired" do certificado NUNCA é gravado aqui, é sempre derivado comparando certificate_valid_until com a data atual (ver computeCertificateEffectiveStatus em @ir/types).';
comment on column public.nfse_issuer_configs.certificate_reference is
  'Referência segura futura ao certificado (nunca o arquivo PFX/P12, senha ou chave privada) — estratégia de armazenamento real será definida na fase de integração (Parte 2+).';

create index nfse_issuer_configs_updated_at_idx on public.nfse_issuer_configs (updated_at desc);

create trigger nfse_issuer_configs_set_updated_at
  before update on public.nfse_issuer_configs
  for each row
  execute function public.set_updated_at();

create or replace function public.set_nfse_issuer_config_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

comment on function public.set_nfse_issuer_config_actor() is
  'created_by/updated_by sempre auth.uid() da sessão autenticada — ignora qualquer valor vindo do cliente.';

create trigger nfse_issuer_configs_set_actor
  before insert or update on public.nfse_issuer_configs
  for each row
  execute function public.set_nfse_issuer_config_actor();

alter table public.nfse_issuer_configs enable row level security;

create policy nfse_issuer_configs_select_admin_owner
  on public.nfse_issuer_configs for select
  to authenticated
  using (public.is_active_admin_or_owner());

create policy nfse_issuer_configs_insert_admin_owner
  on public.nfse_issuer_configs for insert
  to authenticated
  with check (public.is_active_admin_or_owner());

create policy nfse_issuer_configs_update_admin_owner
  on public.nfse_issuer_configs for update
  to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());

-- ==================================================================
-- 2) PERFIS DE SERVIÇO (item 5) — nenhum seed de código fiscal, todo
-- perfil nasce com os campos fiscais vazios. Nunca excluído (sem
-- policy de delete) — só desativado (active=false).
-- ==================================================================

create table public.nfse_service_profiles (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  active boolean not null default true,

  c_trib_nac text,
  c_trib_mun text,
  c_nbs text,
  default_location_municipality text,
  default_location_ibge_code text,
  issqn_taxation text,
  special_tax_regime text,
  notes text,

  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.nfse_service_profiles is
  'Perfil de serviço da NFS-e — evita preencher toda a configuração fiscal manualmente em cada emissão. c_trib_nac/c_trib_mun/c_nbs/issqn_taxation são SEMPRE texto livre informado pelo usuário, nunca um valor presumido pela aplicação. Nunca excluído — só desativado.';

create index nfse_service_profiles_active_idx on public.nfse_service_profiles (active);

create trigger nfse_service_profiles_set_updated_at
  before update on public.nfse_service_profiles
  for each row
  execute function public.set_updated_at();

create or replace function public.set_nfse_service_profile_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger nfse_service_profiles_set_actor
  before insert or update on public.nfse_service_profiles
  for each row
  execute function public.set_nfse_service_profile_actor();

alter table public.nfse_service_profiles enable row level security;

create policy nfse_service_profiles_select_admin_owner
  on public.nfse_service_profiles for select
  to authenticated
  using (public.is_active_admin_or_owner());

create policy nfse_service_profiles_insert_admin_owner
  on public.nfse_service_profiles for insert
  to authenticated
  with check (public.is_active_admin_or_owner());

create policy nfse_service_profiles_update_admin_owner
  on public.nfse_service_profiles for update
  to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());

-- Sem policy de delete — "excluir" um perfil é sempre active=false.

-- ==================================================================
-- 3) RASCUNHOS DE NFS-e (item 8/9) — independente de contrato/
-- assinatura/conta a receber (nenhuma FK pra essas tabelas). Reusa
-- OBRIGATORIAMENTE public.clients como cadastro mestre do tomador
-- (item 6) — client_id é FK real, mas os dados do tomador em si vêm
-- SEMPRE do snapshot (colunas tomador_*), nunca de um join direto,
-- porque o cliente pode mudar depois e o rascunho precisa continuar
-- mostrando o que foi usado na emissão (item 7).
--
-- status só tem 'draft' nesta fase — authorized/rejected/cancelled/
-- substituted NUNCA são gravados sem existir integração real (item 11).
-- ==================================================================

create table public.nfse_drafts (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique,

  client_id uuid not null references public.clients (id),

  -- Snapshot do tomador (item 7) — cópia independente do cliente no
  -- momento da emissão/rascunho, SOMENTE LEITURA na tela de NFS-e
  -- (ajuste pós-revisão: dados do tomador nunca são editados aqui, só
  -- recarregados do cadastro mestre via "Atualizar dados do cliente").
  -- Nunca escreve de volta em public.clients.
  tomador_kind text not null check (tomador_kind in ('individual', 'company')),
  tomador_name text not null,
  tomador_cpf text,
  tomador_cnpj text,
  tomador_municipal_registration text,
  tomador_state_registration text,
  tomador_zip text,
  tomador_street text,
  tomador_number text,
  tomador_complement text,
  tomador_neighborhood text,
  tomador_city text,
  tomador_state text,
  tomador_ibge_code text,
  tomador_email text,
  tomador_phone text,

  -- Perfil de serviço de origem (item 9) — FK real, mas o snapshot
  -- fiscal abaixo é a fonte de verdade pra ESTE rascunho; o perfil
  -- pode mudar ou ser desativado depois sem afetar rascunhos já
  -- criados.
  service_profile_id uuid references public.nfse_service_profiles (id),
  c_trib_nac text,
  c_trib_mun text,
  c_nbs text,
  issqn_taxation text,
  fiscal_special_tax_regime text,
  location_municipality text,
  location_ibge_code text,

  competency_date date not null,
  service_value numeric(12, 2) not null check (service_value > 0),
  service_description text not null,
  notes text,

  status text not null default 'draft' check (status in ('draft')),

  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.nfse_drafts is
  'Rascunho de NFS-e — independente de contrato/assinatura/conta a receber (Parte 1). tomador_*/c_trib_*/demais campos fiscais são SEMPRE snapshot (cópia no momento da criação/edição do rascunho), nunca lidos por join do cliente/perfil de origem — isso preserva o que foi usado mesmo que o cadastro mestre mude depois (ex.: cliente muda de endereço). status só tem "draft" nesta fase; authorized/rejected/cancelled/substituted serão acrescentados só quando houver integração real de transmissão (Parte 2+).';
comment on column public.nfse_drafts.client_id is
  'Referência ao cadastro mestre (public.clients) — nunca um cadastro de cliente paralelo dentro da NFS-e. Os DADOS do tomador usados nesta emissão vêm das colunas tomador_*, não de um join nesta FK.';

create sequence public.nfse_drafts_reference_seq;

create or replace function public.generate_nfse_draft_reference()
returns text
language sql
as $$
  select 'IR-NFSE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.nfse_drafts_reference_seq')::text, 6, '0');
$$;

alter table public.nfse_drafts
  alter column internal_reference set default public.generate_nfse_draft_reference();

create index nfse_drafts_client_id_idx on public.nfse_drafts (client_id);
create index nfse_drafts_service_profile_id_idx on public.nfse_drafts (service_profile_id) where service_profile_id is not null;
create index nfse_drafts_competency_date_idx on public.nfse_drafts (competency_date);
create index nfse_drafts_created_at_idx on public.nfse_drafts (created_at desc);

create trigger nfse_drafts_set_updated_at
  before update on public.nfse_drafts
  for each row
  execute function public.set_updated_at();

create or replace function public.set_nfse_draft_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger nfse_drafts_set_actor
  before insert or update on public.nfse_drafts
  for each row
  execute function public.set_nfse_draft_actor();

alter table public.nfse_drafts enable row level security;

create policy nfse_drafts_select_admin_owner
  on public.nfse_drafts for select
  to authenticated
  using (public.is_active_admin_or_owner());

create policy nfse_drafts_insert_admin_owner
  on public.nfse_drafts for insert
  to authenticated
  with check (public.is_active_admin_or_owner());

create policy nfse_drafts_update_admin_owner
  on public.nfse_drafts for update
  to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());

-- Sem policy de delete — mesmo princípio dos demais módulos financeiros:
-- nada neste módulo é apagado, só muda de estado.
