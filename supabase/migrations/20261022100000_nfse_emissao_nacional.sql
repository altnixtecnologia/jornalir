-- NFS-e — Parte 2A: emissão nacional (sequência de DPS, NFS-e emitidas,
-- tentativas de transmissão). Incremental sobre
-- 20261021100000_nfse_base.sql. Nenhuma migration anterior foi alterada.
-- Sequência de aplicação:
--   1. 20261011100000_clients.sql
--   2. 20261015100000_subscriptions.sql
--   3. 20261016100000_subscriptions_operational.sql
--   4. 20261017100000_financeiro_contas_a_receber.sql
--   5. 20261018100000_financeiro_geracao_titulos.sql
--   6. 20261019100000_financeiro_credito_cliente.sql
--   7. 20261020100000_financeiro_contratos_bloco2.sql
--   8. 20261021100000_nfse_base.sql
--   9. esta migration
--
-- IMPORTANTE: NÃO aplicada ainda. Nenhuma migration anterior foi
-- alterada — esta só acrescenta (inclusive via ALTER TABLE em
-- nfse_issuer_configs, mesmo princípio já usado em migrations
-- anteriores pra acrescentar coluna em tabela já existente).
--
-- `nfse_drafts` continua sendo só rascunho — nunca se transforma numa
-- tabela genérica de notas. Uma NFS-e efetivamente autorizada só nasce
-- em `nfse_issued_notes`, depois de resposta oficial. Produção continua
-- bloqueada na aplicação (ver @ir/types, isTransmissionEnvironmentAllowed)
-- — esta migration aceita 'production' no check constraint só pra não
-- exigir outra migration quando a trava de aplicação for removida no
-- futuro, mas NENHUM código operacional permite transmitir em produção
-- nesta fase.

-- ==================================================================
-- 0) SÉRIE DA DPS CONFIGURÁVEL (item 5) — nenhum valor fictício. Fica
-- NULL até o usuário configurar explicitamente; a transmissão é
-- bloqueada enquanto estiver vazia ou em formato inválido.
--
-- AJUSTE DE SEGURANÇA pós-revisão: a faixa semântica "1-49999 só pra
-- emissão com aplicativo próprio" (presente numa versão anterior desta
-- migration, ainda não aplicada) foi REMOVIDA por não ter sido
-- confirmada contra uma fonte oficial vigente nesta sessão — só
-- fontes secundárias. Só a validação de FORMATO permanece (até 5
-- dígitos numéricos, largura confirmada do campo "Série DPS" no
-- identificador oficial — ver buildDpsId/isValidDpsSeriesFormat em
-- @ir/types). A transmissão real continua bloqueada por outros
-- motivos (assinatura/XSD/certificado) mesmo com a série configurada.
-- ==================================================================

alter table public.nfse_issuer_configs
  add column dps_series text;

comment on column public.nfse_issuer_configs.dps_series is
  'Série da DPS usada nas transmissões deste prestador — configurável, nunca um valor fictício. NULL até o usuário configurar; transmissão bloqueada enquanto NULL ou com formato inválido (ver isValidDpsSeriesFormat em @ir/types — só valida largura do campo, nunca uma faixa semântica não confirmada).';

alter table public.nfse_issuer_configs
  add column signature_algorithm text check (signature_algorithm is null or signature_algorithm in ('rsa-sha1', 'rsa-sha256'));

comment on column public.nfse_issuer_configs.signature_algorithm is
  'Algoritmo de assinatura da DPS — AINDA NÃO HÁ CONFIRMAÇÃO OFICIAL conclusiva de qual é exigido pelo Sistema Nacional (ver signature.ts). NULL até o usuário escolher explicitamente; nunca um default assumido. Transmissão real continua bloqueada por outros motivos mesmo depois de escolhido.';

alter table public.nfse_service_profiles
  add column issqn_rate numeric(5, 2) check (issqn_rate is null or (issqn_rate >= 0 and issqn_rate <= 100));

comment on column public.nfse_service_profiles.issqn_rate is
  'Alíquota do ISSQN (%) — SEMPRE informada explicitamente pelo usuário, nunca calculada/presumida pela aplicação. Obrigatória só para transmitir, não para salvar o perfil.';

-- ==================================================================
-- 1) SEQUÊNCIA DE DPS (item 5) — reserva atômica por prestador +
-- ambiente + série. Nosso sistema NUNCA inventa número de NFS-e (isso
-- só existe depois da resposta oficial) — mas a DPS tem série e número
-- sequencial crescente sob nosso controle, e a reserva precisa ser
-- atômica (RPC abaixo, mesmo princípio de `apply_client_credit`: lock
-- de linha fecha a janela de corrida entre chamadas concorrentes).
-- ==================================================================

create table public.nfse_dps_sequences (
  id uuid primary key default gen_random_uuid(),
  issuer_config_id uuid not null references public.nfse_issuer_configs (id),
  environment text not null check (environment in ('homologation', 'production')),
  series text not null,
  next_number bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (issuer_config_id, environment, series)
);

comment on table public.nfse_dps_sequences is
  'Controle atômico da sequência de número de DPS por prestador+ambiente+série. Nunca atualizada diretamente pela aplicação — só via public.reserve_next_dps_number(), que faz o UPDATE sob lock de linha (atômico contra concorrência).';
comment on column public.nfse_dps_sequences.series is
  'Série da DPS — configurável, nunca um valor fictício. Só a largura do campo (até 5 dígitos) é validada na aplicação (ver isValidDpsSeriesFormat em @ir/types) — nenhuma faixa semântica específica é aplicada sem confirmação oficial.';

create trigger nfse_dps_sequences_set_updated_at
  before update on public.nfse_dps_sequences
  for each row
  execute function public.set_updated_at();

alter table public.nfse_dps_sequences enable row level security;

create policy nfse_dps_sequences_select_admin_owner
  on public.nfse_dps_sequences for select
  to authenticated
  using (public.is_active_admin_or_owner());

-- Sem policy de insert/update direto — toda mutação passa pela RPC
-- abaixo (security definer), nunca por um UPDATE solto da aplicação.

create or replace function public.reserve_next_dps_number(
  p_issuer_config_id uuid,
  p_environment text,
  p_series text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number bigint;
begin
  if not public.is_active_admin_or_owner() then
    raise exception 'Sem permissão para reservar número de DPS.';
  end if;
  if p_environment not in ('homologation', 'production') then
    raise exception 'Ambiente inválido: %', p_environment;
  end if;
  if p_series is null or p_series = '' then
    raise exception 'Série da DPS não informada.';
  end if;

  insert into public.nfse_dps_sequences (issuer_config_id, environment, series, next_number)
  values (p_issuer_config_id, p_environment, p_series, 1)
  on conflict (issuer_config_id, environment, series) do nothing;

  -- UPDATE sempre toma lock de linha — a segunda chamada concorrente
  -- bloqueia até a primeira comitar, nunca duas reservas pegam o mesmo
  -- número (mesmo princípio de apply_client_credit).
  update public.nfse_dps_sequences
    set next_number = next_number + 1
    where issuer_config_id = p_issuer_config_id
      and environment = p_environment
      and series = p_series
    returning next_number - 1 into v_number;

  if v_number is null then
    raise exception 'Não foi possível reservar o número da DPS.';
  end if;

  return v_number;
end;
$$;

comment on function public.reserve_next_dps_number is
  'Reserva atômica (lock de linha) do próximo número de DPS pra um prestador+ambiente+série. Número nunca reutilizado silenciosamente — cada chamada bem-sucedida incrementa a sequência permanentemente, mesmo que a transmissão subsequente falhe (ver item 11 do prompt: consultar a DPS antes de reemitir, nunca gerar outra DPS automaticamente só por falha de rede).';

grant execute on function public.reserve_next_dps_number(uuid, text, text) to authenticated;

-- ==================================================================
-- 2) NFS-e EMITIDAS (item 10) — só nasce depois de autorização real.
-- Preserva o snapshot fiscal efetivamente transmitido (XML assinado +
-- XML de retorno) — uma alteração futura em cliente/perfil/config
-- NUNCA altera uma nota já emitida. `draft_id` é UNIQUE: nunca duas
-- NFS-e autorizadas a partir do mesmo rascunho (idempotência real,
-- item 12 — não só uma checagem em memória).
-- ==================================================================

create table public.nfse_issued_notes (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique references public.nfse_drafts (id),
  issuer_config_id uuid not null references public.nfse_issuer_configs (id),
  client_id uuid not null references public.clients (id),

  environment text not null check (environment in ('homologation', 'production')),
  dps_series text not null,
  dps_number bigint not null,
  dps_id text not null,

  -- Preenchidos SÓ pela resposta oficial — nunca calculados/inventados
  -- pela nossa aplicação (item 5/10).
  access_key text,
  nfse_number text,
  issued_at timestamptz,

  competency_date date not null,
  service_value numeric(12, 2) not null check (service_value > 0),

  signed_dps_xml text not null,
  nfse_xml text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),

  unique (issuer_config_id, environment, dps_series, dps_number)
);

comment on table public.nfse_issued_notes is
  'NFS-e efetivamente autorizada pelo Sistema Nacional — nunca criada a partir de uma rejeição (ver nfse_transmission_attempts). draft_id é UNIQUE: proteção real contra emissão duplicada a partir do mesmo rascunho (duplo clique/refresh/retry nunca criam uma segunda linha). access_key/nfse_number/issued_at só existem depois da resposta oficial — nunca inventados.';

create index nfse_issued_notes_client_id_idx on public.nfse_issued_notes (client_id);
create index nfse_issued_notes_competency_date_idx on public.nfse_issued_notes (competency_date);

alter table public.nfse_issued_notes enable row level security;

create policy nfse_issued_notes_select_admin_owner
  on public.nfse_issued_notes for select
  to authenticated
  using (public.is_active_admin_or_owner());

create policy nfse_issued_notes_insert_admin_owner
  on public.nfse_issued_notes for insert
  to authenticated
  with check (public.is_active_admin_or_owner());

-- Sem policy de update/delete — uma NFS-e emitida é um registro
-- histórico imutável (cancelamento/substituição são eventos PRÓPRIOS,
-- Parte 2B+, nunca uma edição desta linha).

create or replace function public.set_nfse_issued_note_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger nfse_issued_notes_set_actor
  before insert on public.nfse_issued_notes
  for each row
  execute function public.set_nfse_issued_note_actor();

-- ==================================================================
-- 3) TENTATIVAS DE TRANSMISSÃO (item 11) — histórico técnico
-- detalhado de cada chamada à API Nacional (sucesso, rejeição ou
-- resultado incerto). Separado de public.audit_events por design:
-- audit_events = auditoria de AÇÃO (quem fez o quê, quando);
-- nfse_transmission_attempts = detalhes TÉCNICOS da transmissão em si
-- (item 13 — nunca duplicar um dentro do outro).
-- ==================================================================

create table public.nfse_transmission_attempts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.nfse_drafts (id),

  dps_series text,
  dps_number bigint,
  environment text not null check (environment in ('homologation', 'production')),

  status text not null check (status in ('pending', 'authorized', 'rejected', 'uncertain')),

  -- Identificação segura da requisição (ex.: um id de correlação) —
  -- NUNCA o payload completo nem qualquer segredo.
  request_reference text,
  response_summary text,
  rejection_code text,
  rejection_message text,

  issued_note_id uuid references public.nfse_issued_notes (id),

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.nfse_transmission_attempts is
  'Histórico técnico de cada tentativa de transmissão da DPS — nunca registra senha/PFX/chave privada/segredo de ambiente (item 11). status=uncertain cobre timeout/falha de rede depois do envio e antes da resposta: nesta situação a aplicação NUNCA gera outra DPS/retransmite automaticamente — precisa consultar a DPS pela chave/id oficial antes de qualquer nova tentativa (item 11/12).';

create index nfse_transmission_attempts_draft_id_idx on public.nfse_transmission_attempts (draft_id);
create index nfse_transmission_attempts_created_at_idx on public.nfse_transmission_attempts (created_at desc);

alter table public.nfse_transmission_attempts enable row level security;

create policy nfse_transmission_attempts_select_admin_owner
  on public.nfse_transmission_attempts for select
  to authenticated
  using (public.is_active_admin_or_owner());

create policy nfse_transmission_attempts_insert_admin_owner
  on public.nfse_transmission_attempts for insert
  to authenticated
  with check (public.is_active_admin_or_owner());

-- Sem policy de update/delete — uma tentativa registrada nunca é
-- editada depois; uma tentativa posterior é sempre uma linha nova.

create or replace function public.set_nfse_transmission_attempt_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger nfse_transmission_attempts_set_actor
  before insert on public.nfse_transmission_attempts
  for each row
  execute function public.set_nfse_transmission_attempt_actor();
