-- Assinaturas -> Avisos de vencimento (WhatsApp) — pedido explícito do
-- usuário em 18/10/2026. NÃO aplicada ainda (local apenas). Processo
-- MANUAL nesta primeira versão: sistema prepara a relação, operador
-- confere/ajusta, usuário autorizado confirma o disparo real (nenhum envio
-- automático no dia-base). Separado de propósito de
-- commercial_announcements (Comercial -> Avisos, push) — módulo e canal
-- totalmente diferentes.

create table public.subscription_due_reminder_batches (
  id uuid primary key default gen_random_uuid(),

  -- Mês de competência do lote (sempre dia 1) — não é a data de disparo.
  reference_month date not null,
  message_template text not null check (char_length(message_template) between 1 and 1000),

  status text not null default 'draft' check (status in ('draft', 'sent')),

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_by uuid references public.profiles (id),
  sent_at timestamptz,

  constraint subscription_due_reminder_batches_reference_month_is_first_day
    check (reference_month = date_trunc('month', reference_month)::date),
  constraint subscription_due_reminder_batches_sent_consistency check (
    (status = 'draft' and sent_at is null and sent_by is null)
    or (status = 'sent' and sent_at is not null and sent_by is not null)
  )
);

comment on table public.subscription_due_reminder_batches is
  'Lote mensal de avisos de vencimento (WhatsApp) — Assinaturas. status=draft é só preparação/revisão interna, nunca envia nada; status=sent significa que o operador confirmou o disparo manual (ver subscription_due_reminder_recipients para o resultado por destinatário).';

-- Um cliente = um destinatário (nunca duplicado), mesmo que tenha mais de
-- uma assinatura vencendo no mês — subscription_ids reúne todas as
-- assinaturas relevantes desse cliente neste lote.
create table public.subscription_due_reminder_recipients (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.subscription_due_reminder_batches (id) on delete cascade,

  client_id uuid not null references public.clients (id),
  subscription_ids uuid[] not null check (array_length(subscription_ids, 1) >= 1),

  -- Snapshot do telefone no momento da preparação do lote — nunca segue
  -- uma alteração posterior do cadastro sem o operador revisar de novo.
  phone_snapshot text,
  phone_valid boolean not null default true,

  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  message_rendered text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,

  created_at timestamptz not null default now(),

  constraint subscription_due_reminder_recipients_unique_client_per_batch
    unique (batch_id, client_id)
);

comment on table public.subscription_due_reminder_recipients is
  'Um destinatário por cliente por lote (nunca duplicado, mesmo com várias assinaturas vencendo) — snapshot do telefone e resultado individual do envio.';

create index subscription_due_reminder_recipients_batch_idx
  on public.subscription_due_reminder_recipients (batch_id);

create trigger subscription_due_reminder_batches_set_updated_at
  before update on public.subscription_due_reminder_batches
  for each row execute function public.set_updated_at();

alter table public.subscription_due_reminder_batches enable row level security;
alter table public.subscription_due_reminder_recipients enable row level security;

-- Mesmo princípio de commercial_announcements: módulo novo, RLS própria
-- restrita a admin/owner (nunca operator) — "usuário autorizado confirma o
-- disparo", pedido explícito do usuário.
create policy subscription_due_reminder_batches_admin_all
  on public.subscription_due_reminder_batches for all
  to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());

create policy subscription_due_reminder_recipients_admin_all
  on public.subscription_due_reminder_recipients for all
  to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());
