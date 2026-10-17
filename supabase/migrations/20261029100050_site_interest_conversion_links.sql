-- RENOMEADA em 17/10/2026 (de 20261013043920 para 20261029100050):
-- referencia public.commercial_proposals (coluna converted_proposal_id
-- abaixo), que só é criada por 20261029100000_commercial_proposals.sql
-- — em ordem de nome de arquivo, o nome antigo (13/10) rodaria ANTES
-- da tabela existir e falharia. Nunca aplicada a nenhum banco real; só
-- o nome do arquivo mudou, conteúdo idêntico. Ver também
-- 20261029100060_site_interest_attendance_and_route.sql, que depende
-- das colunas criadas aqui e foi renomeada junto, na mesma auditoria.
alter table public.site_interest_requests
  add column if not exists converted_client_id uuid references public.clients(id) on delete set null,
  add column if not exists converted_subscription_id uuid references public.subscriptions(id) on delete set null,
  add column if not exists converted_receivable_id uuid references public.receivables(id) on delete set null,
  add column if not exists converted_proposal_id uuid references public.commercial_proposals(id) on delete set null,
  add column if not exists converted_at timestamptz;

create index if not exists site_interest_requests_converted_client_idx
  on public.site_interest_requests (converted_client_id)
  where converted_client_id is not null;

create index if not exists site_interest_requests_converted_subscription_idx
  on public.site_interest_requests (converted_subscription_id)
  where converted_subscription_id is not null;

create index if not exists site_interest_requests_converted_proposal_idx
  on public.site_interest_requests (converted_proposal_id)
  where converted_proposal_id is not null;

comment on column public.site_interest_requests.converted_client_id is
  'Cliente mestre vinculado quando a solicitação é convertida.';
comment on column public.site_interest_requests.converted_subscription_id is
  'Assinatura criada a partir da solicitação, quando houver.';
comment on column public.site_interest_requests.converted_receivable_id is
  'Primeiro título financeiro criado para a assinatura, quando houver.';
comment on column public.site_interest_requests.converted_proposal_id is
  'Proposta comercial criada para a parte de publicidade, quando houver.';
