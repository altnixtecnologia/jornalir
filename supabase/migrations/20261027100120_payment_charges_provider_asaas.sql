-- NOVA em 17/10/2026 (preparação de publicação, reconciliação de
-- histórico). Executa a alteração em public.payment_charges que já
-- existe (protegida por guarda to_regclass) em
-- 20261012223715_assine_requests_and_billing_provider.sql — aquele
-- arquivo já está aplicado no remoto sob este nome exato e tem timestamp
-- 14 dias ANTERIOR a 20261027100100_payment_charges.sql (que cria a
-- tabela, aplicada imediatamente antes desta), então num fresh install a
-- tabela ainda não existia nesse ponto e a guarda pulava a alteração.
-- Idempotente (drop constraint if exists + add constraint).
alter table public.payment_charges
  drop constraint if exists payment_charges_provider_check;
alter table public.payment_charges
  add constraint payment_charges_provider_check
  check (provider in ('pix_manual','asaas'));
