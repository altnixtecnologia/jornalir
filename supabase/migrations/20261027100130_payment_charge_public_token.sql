-- NOVA em 17/10/2026 (preparação de publicação, reconciliação de
-- histórico). Executa a alteração em public.payment_charges que já
-- existe (protegida por guarda to_regclass) em
-- 20261013034031_payment_charge_public_token.sql — aquele arquivo já
-- está aplicado no remoto sob este nome exato e tem timestamp 14 dias
-- ANTERIOR a 20261027100100_payment_charges.sql (que cria a tabela).
-- Idempotente.
alter table public.payment_charges
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists payment_charges_public_token_unique
  on public.payment_charges (public_token);

comment on column public.payment_charges.public_token is
  'Token público aleatório usado apenas para abrir a página de pagamento do cliente. Não substitui id interno nem provider_charge_id.';
