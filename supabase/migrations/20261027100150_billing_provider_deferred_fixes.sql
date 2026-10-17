-- EXTRAÍDO de 20261012223715_assine_requests_and_billing_provider.sql em
-- 17/10/2026 (preparação de publicação). Conteúdo idêntico, só a posição
-- mudou: os dois blocos abaixo referenciam public.clients (só existe a
-- partir de 20261014110000_clients.sql) e public.payment_charges (só
-- existe a partir de 20261027100100_payment_charges.sql, aplicada
-- IMEDIATAMENTE antes desta) — o arquivo original tinha timestamp
-- anterior aos dois. Um fresh install (`supabase start` do zero) falhava
-- com "relation does not exist". `add column if not exists`/`create ...
-- if not exists`/`drop constraint if exists` já eram idempotentes no
-- original — nenhuma mudança de comportamento, só de posição.

-- Cliente Asaas reutilizável em todas as cobranças do mesmo cadastro.
alter table public.clients
  add column if not exists asaas_customer_id text;

create unique index if not exists clients_asaas_customer_id_unique
  on public.clients (asaas_customer_id)
  where asaas_customer_id is not null;

-- Provedor real passa a coexistir com o provider de preview.
alter table public.payment_charges
  drop constraint if exists payment_charges_provider_check;
alter table public.payment_charges
  add constraint payment_charges_provider_check
  check (provider in ('pix_manual','asaas'));
