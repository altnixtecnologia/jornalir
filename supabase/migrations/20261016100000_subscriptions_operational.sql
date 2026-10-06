-- Assinaturas — Parte 2B (regras operacionais), incremental sobre
-- 20261015100000_subscriptions.sql (que depende de 20261011100000_clients.sql).
-- Ordem de aplicação: clients -> subscriptions -> esta migration.
--
-- IMPORTANTE: NÃO aplicada ainda. Nenhuma das duas migrations anteriores
-- (clients, subscriptions) também foi aplicada — esta continua a
-- sequência, nunca a reordena.

-- 1) Vencimento deixa de ser uma única data solta e passa a três
-- conceitos separados, coerentes com uma assinatura recorrente:
--   - due_day: dia preferencial de cobrança (1-31) — só estrutura por
--     enquanto; a lógica de "mês sem esse dia usa o último dia válido"
--     é responsabilidade do Financeiro, quando existir.
--   - next_due_date (era "due_date"): a próxima competência/cobrança
--     esperada — data completa, ajustável manualmente, e que o
--     Financeiro vai atualizar quando as cobranças forem geradas.
--   - ends_at: encerramento programado da assinatura, OPCIONAL e
--     DISTINTO de status='cancelled' — nunca cancela nada
--     automaticamente nesta fase (não existem jobs/automação ainda).
alter table public.subscriptions rename column due_date to next_due_date;
alter table public.subscriptions rename constraint subscriptions_due_date_not_before_start to subscriptions_next_due_date_not_before_start;
alter index public.subscriptions_due_date_idx rename to subscriptions_next_due_date_idx;

alter table public.subscriptions
  add column due_day integer check (due_day between 1 and 31),
  add column ends_at date;

comment on column public.subscriptions.next_due_date is
  'Próxima competência/cobrança esperada — data completa, ajustável manualmente. Sugerida no cadastro a partir de starts_at + due_day; o Financeiro passa a atualizá-la quando gerar cobranças.';
comment on column public.subscriptions.due_day is
  'Dia preferencial de cobrança (1-31) — só estrutura nesta fase. Quando o mês não tiver esse dia, usar o último dia válido do mês é regra do Financeiro, ainda não implementada.';
comment on column public.subscriptions.ends_at is
  'Encerramento PROGRAMADO da assinatura — opcional, nunca cancela nada automaticamente (sem jobs/automação ainda) e nunca deve ser confundido com status=''cancelled''.';

-- 2) Cancelamento é estado final (nunca reativado — pra retomar o
-- serviço, cria-se uma nova assinatura). Registrar quando/por quê sem
-- complicar a modelagem: duas colunas simples, preenchidas pela
-- aplicação só na transição para 'cancelled' (nenhum trigger —
-- mantém a regra de transição inteira no SubscriptionService).
alter table public.subscriptions
  add column cancelled_at timestamptz,
  add column cancellation_reason text;

comment on column public.subscriptions.cancelled_at is
  'Preenchido pela aplicação só quando status passa a cancelled. Cancelada é estado final — não existe transição de volta.';

-- 3) Entrega do IMPRESSO — só relevante quando service_type='impresso';
-- nulo para digital/tv. Endereço de entrega PRÓPRIO da assinatura
-- (pode diferir do endereço do cliente), mesmos nomes de campo do
-- endereço de public.clients por consistência.
alter table public.subscriptions
  add column print_copies integer check (print_copies >= 1),
  add column print_address_zip text,
  add column print_address_street text,
  add column print_address_number text,
  add column print_address_complement text,
  add column print_address_neighborhood text,
  add column print_address_city text,
  add column print_address_state text;

comment on column public.subscriptions.print_copies is
  'Quantidade de exemplares — só para service_type=''impresso''. Mínimo 1 (padrão 1, aplicado pela aplicação).';

-- 4) Integração TV — referências externas GENÉRICAS e OPCIONAIS para um
-- vínculo futuro com o Altnix Informativo, sem acoplamento forte: nenhuma
-- FK, nenhuma consulta a outro banco, nenhuma integração de API agora.
-- Só relevante quando service_type='tv'; nulo para impresso/digital.
alter table public.subscriptions
  add column external_source text,
  add column external_client_reference text,
  add column external_device_reference text;

comment on column public.subscriptions.external_source is
  'Identifica de qual sistema externo vieram as referências abaixo (ex.: ''altnix-informativo'') — genérico, sem FK nem integração real ainda.';
comment on column public.subscriptions.external_client_reference is
  'Referência opcional do cliente no sistema externo (ex.: Altnix Informativo) — só estrutura, sem consulta real a outro banco.';
comment on column public.subscriptions.external_device_reference is
  'Referência opcional do dispositivo/equipamento no sistema externo — só estrutura, sem integração real.';

create index subscriptions_ends_at_idx on public.subscriptions (ends_at) where ends_at is not null;
