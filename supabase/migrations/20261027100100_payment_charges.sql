-- Cobrança Pix (e, no futuro, outros meios de cobrança criada-e-aguardando)
-- — tabela própria, DELIBERADAMENTE separada de receivable_receipts.
-- Incremental sobre 20261027100000_payment_method_expanded.sql. NÃO
-- aplicada ainda.
--
-- DISTINÇÃO CONCEITUAL (não é o mesmo conceito, não cabe na mesma tabela):
--   receivable_receipts = pagamento JÁ realizado/confirmado.
--   payment_charges     = cobrança CRIADA, ainda aguardando pagamento.
-- Confirmar uma cobrança NUNCA edita um receipt existente — sempre cria um
-- receipt novo (paymentMethod='pix') e só então marca a cobrança como
-- paga, ligando receipt_id. Nenhum saldo de receivable é tocado só por
-- existir uma cobrança pendente.
--
-- "payment_charges" (não "pix_charges"): provider-agnostic de propósito —
-- hoje só existe o provider de demonstração ('pix_manual', preview), mas o
-- desenho já comporta outros meios de cobrança-e-confirmação no futuro
-- sem precisar de uma tabela nova por provedor.
--
-- NENHUM PROVEDOR PIX REAL FOI ESCOLHIDO/INTEGRADO NESTA MIGRATION — ver
-- PixProvider em @ir/core (packages/core/src/financeiro/pix-provider.ts).
-- `provider` só aceita 'pix_manual' agora; um provedor real exigirá uma
-- migration própria ampliando este check, nunca um nome inventado aqui.
--
-- QR Code: nunca armazenado como imagem/base64 — só `pix_copy_paste`
-- (payload), e a aplicação sempre renderiza o QR a partir dele.

create table public.payment_charges (
  id uuid primary key default gen_random_uuid(),

  receivable_id uuid not null references public.receivables (id),
  client_id uuid not null references public.clients (id),

  provider text not null default 'pix_manual' check (provider in ('pix_manual')),
  -- txid/id da cobrança no provedor — nulo só é esperado em preview
  -- (adapter de demonstração sempre preenche com um valor fictício).
  provider_charge_id text,

  amount numeric(12, 2) not null check (amount > 0),
  description text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled', 'failed')),

  pix_copy_paste text,
  expires_at timestamptz,
  paid_at timestamptz,

  -- Idempotência da confirmação (item 11/12 da tarefa): se já preenchido,
  -- a confirmação NUNCA cria um segundo receipt pra esta cobrança —
  -- checado pela aplicação (PaymentChargeService.confirmPixCharge) antes
  -- de qualquer insert em receivable_receipts.
  receipt_id uuid references public.receivable_receipts (id),

  -- Cancelamento: preenchido uma única vez, nunca desfeito — mesmo
  -- princípio do estorno de receivable_receipts/receivable_adjustments.
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancellation_reason text,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_charges_cancel_all_or_nothing check (
    (cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (cancelled_at is not null and cancellation_reason is not null)
  )
);

comment on table public.payment_charges is
  'Cobrança criada e aguardando pagamento (hoje só Pix, provider-agnostic no desenho) — DIFERENTE de receivable_receipts (pagamento já confirmado). Confirmar sempre cria um receipt novo e liga receipt_id (idempotência: nunca duplica). Nenhum provedor real integrado ainda — provider só aceita "pix_manual" (demonstração).';
comment on column public.payment_charges.receipt_id is
  'Preenchido quando a cobrança é confirmada e um receivable_receipt é criado — chave de idempotência da confirmação. NUNCA um segundo receipt é criado pra mesma cobrança.';
comment on column public.payment_charges.pix_copy_paste is
  'Payload Pix "copia e cola" — NUNCA a imagem do QR. O QR é sempre renderizado pela aplicação a partir deste payload, nunca armazenado como base64/arquivo.';

-- Nunca mais de uma cobrança PENDENTE por título ao mesmo tempo (item 24
-- da tarefa) — reforça na própria constraint do banco, não só no aviso da
-- UI: evita cobranças duplicadas acidentais mesmo sob concorrência.
create unique index payment_charges_one_pending_per_receivable
  on public.payment_charges (receivable_id)
  where status = 'pending';

-- Idempotência externa (item 11) — nunca duas linhas pra mesma cobrança do
-- provedor (protege contra webhook duplicado, quando houver provedor real).
create unique index payment_charges_provider_charge_id_unique
  on public.payment_charges (provider, provider_charge_id)
  where provider_charge_id is not null;

create index payment_charges_receivable_id_idx on public.payment_charges (receivable_id);
create index payment_charges_client_id_idx on public.payment_charges (client_id);
create index payment_charges_status_idx on public.payment_charges (status);

create trigger payment_charges_set_updated_at
  before update on public.payment_charges
  for each row
  execute function public.set_updated_at();

create or replace function public.set_payment_charge_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger payment_charges_set_actor
  before insert on public.payment_charges
  for each row
  execute function public.set_payment_charge_actor();

alter table public.payment_charges enable row level security;

create policy payment_charges_select_staff
  on public.payment_charges for select
  to authenticated
  using (public.is_active_staff());

create policy payment_charges_insert_staff
  on public.payment_charges for insert
  to authenticated
  with check (public.is_active_staff());

create policy payment_charges_update_staff
  on public.payment_charges for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- Sem policy de delete — cancelar é sempre status='cancelled' +
-- cancelled_at/cancelled_by/cancellation_reason, mesmo princípio do
-- restante do Financeiro.
