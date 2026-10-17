-- EXTRAÍDO de 20261013034031_payment_charge_public_token.sql em
-- 17/10/2026 (preparação de publicação). Conteúdo idêntico, só a posição
-- mudou: public.payment_charges só existe a partir de
-- 20261027100100_payment_charges.sql (aplicada imediatamente antes
-- desta) — o arquivo original tinha timestamp 14 dias anterior. Um fresh
-- install falhava com "relation public.payment_charges does not exist".
alter table public.payment_charges
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists payment_charges_public_token_unique
  on public.payment_charges (public_token);

comment on column public.payment_charges.public_token is
  'Token público aleatório usado apenas para abrir a página de pagamento do cliente. Não substitui id interno nem provider_charge_id.';
