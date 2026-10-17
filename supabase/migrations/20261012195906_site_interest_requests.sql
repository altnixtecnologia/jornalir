-- Solicitações comerciais/assinaturas vindas do portal público.
create table public.site_interest_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('subscription', 'advertising', 'mixed')),
  name text not null,
  phone text not null,
  email text,
  city text,
  company text,
  selections jsonb not null default '[]'::jsonb check (jsonb_typeof(selections) = 'array'),
  estimated_total numeric(12, 2) check (estimated_total is null or estimated_total >= 0),
  notes text,
  consent_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'discarded')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  source text not null default 'site',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_interest_requests_name_length check (char_length(name) between 2 and 120),
  constraint site_interest_requests_phone_length check (char_length(phone) between 8 and 40),
  constraint site_interest_requests_email_length check (email is null or char_length(email) <= 180),
  constraint site_interest_requests_city_length check (city is null or char_length(city) <= 120),
  constraint site_interest_requests_company_length check (company is null or char_length(company) <= 180),
  constraint site_interest_requests_notes_length check (notes is null or char_length(notes) <= 2000)
);

comment on table public.site_interest_requests is
  'Solicitações do portal público para assinatura e/ou publicidade. A solicitação é sempre sujeita à avaliação comercial; nunca cria venda, assinatura ou título financeiro automaticamente.';

create index site_interest_requests_status_created_idx
  on public.site_interest_requests (status, created_at desc);

create index site_interest_requests_created_at_idx
  on public.site_interest_requests (created_at desc);

create trigger site_interest_requests_set_updated_at
  before update on public.site_interest_requests
  for each row
  execute function public.set_updated_at();

alter table public.site_interest_requests enable row level security;

create policy site_interest_requests_select_staff
  on public.site_interest_requests for select
  to authenticated
  using (public.is_active_staff());

create policy site_interest_requests_update_staff
  on public.site_interest_requests for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create or replace function public.submit_site_interest_request(
  p_request_type text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_city text default null,
  p_company text default null,
  p_selections jsonb default '[]'::jsonb,
  p_estimated_total numeric default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if p_request_type not in ('subscription', 'advertising', 'mixed') then
    raise exception 'Tipo de solicitação inválido.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Nome inválido.'; end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 40 then raise exception 'Telefone inválido.'; end if;
  if v_email is not null and char_length(v_email) > 180 then raise exception 'E-mail inválido.'; end if;
  if v_city is not null and char_length(v_city) > 120 then raise exception 'Cidade inválida.'; end if;
  if v_company is not null and char_length(v_company) > 180 then raise exception 'Empresa inválida.'; end if;
  if v_notes is not null and char_length(v_notes) > 2000 then raise exception 'Observação muito longa.'; end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' then raise exception 'Seleções inválidas.'; end if;
  if jsonb_array_length(p_selections) = 0 or jsonb_array_length(p_selections) > 10 then raise exception 'Selecione pelo menos um item válido.'; end if;
  if p_estimated_total is not null and (p_estimated_total < 0 or p_estimated_total > 1000000) then raise exception 'Valor estimado inválido.'; end if;

  insert into public.site_interest_requests (
    request_type, name, phone, email, city, company, selections, estimated_total, notes
  )
  values (
    p_request_type, v_name, v_phone, v_email, v_city, v_company, p_selections, p_estimated_total, v_notes
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_site_interest_request(
  text, text, text, text, text, text, jsonb, numeric, text
) from public;

grant execute on function public.submit_site_interest_request(
  text, text, text, text, text, text, jsonb, numeric, text
) to anon, authenticated;

comment on function public.submit_site_interest_request(
  text, text, text, text, text, text, jsonb, numeric, text
) is
  'Entrada pública controlada para interesses de assinatura/publicidade. Apenas registra a solicitação para análise; não cria venda, assinatura, cliente ou financeiro.';

-- Seed de public.commercial_products MOVIDO para 20261028100050_commercial_
-- products_seed.sql em 17/10/2026 (preparação de publicação) — a tabela só
-- é criada em 20261028100000_comercial_publicidade.sql, 16 dias depois deste
-- arquivo; um fresh install (`supabase start` do zero) falhava aqui com
-- "relation public.commercial_products does not exist". No ambiente remoto
-- já aplicado isto nunca foi um problema porque a ordem real de aplicação
-- não seguiu a ordem de nome de arquivo atual — mas um banco novo sempre
-- aplica em ordem de nome, então o bug era real para qualquer ambiente
-- futuro criado do zero. Nunca renomear ESTE arquivo (20261012195906) nem
-- mudar seu timestamp — já está registrado como aplicado no histórico
-- remoto sob este nome exato.
