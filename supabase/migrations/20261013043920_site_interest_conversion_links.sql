-- GUARDA adicionada em 17/10/2026 (reconciliação de histórico): este
-- arquivo já está aplicado no remoto sob este nome exato e depende de
-- public.clients (20261014110000), public.subscriptions (20261015100000),
-- public.receivables (20261017100000) e public.commercial_proposals
-- (20261029100000) — todas criadas DEPOIS deste arquivo (de 1 a 16 dias
-- depois). Alteração real para fresh install em
-- 20261029100010_site_interest_conversion_links.sql (nova, depois de
-- commercial_proposals, a última e mais tardia das 4 dependências).
-- Idempotente (add column/create index if not exists).
do $$
begin
  if to_regclass('public.clients') is not null
     and to_regclass('public.subscriptions') is not null
     and to_regclass('public.receivables') is not null
     and to_regclass('public.commercial_proposals') is not null
  then
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
  end if;
end $$;
