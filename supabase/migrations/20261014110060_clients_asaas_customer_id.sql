-- NOVA em 17/10/2026 (preparação de publicação, reconciliação de
-- histórico). Executa a alteração em public.clients que já existe
-- (protegida por guarda to_regclass) em
-- 20261012223715_assine_requests_and_billing_provider.sql — aquele
-- arquivo já está aplicado no remoto sob este nome exato e tem timestamp
-- 2 dias ANTERIOR a 20261014110000_clients.sql (que cria a tabela),
-- então num fresh install a tabela ainda não existia nesse ponto e a
-- guarda pulava a alteração. Mesmo princípio de
-- 20261014110050_site_ad_media_client_fk.sql (migration vizinha, mesma
-- reconciliação). Idempotente (add column/create index if not exists).
alter table public.clients
  add column if not exists asaas_customer_id text;

create unique index if not exists clients_asaas_customer_id_unique
  on public.clients (asaas_customer_id)
  where asaas_customer_id is not null;

comment on column public.clients.asaas_customer_id is
  'Cliente Asaas reutilizável em todas as cobranças do mesmo cadastro.';
