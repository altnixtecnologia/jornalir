-- 1) Ofertas digitais separadas na página Assine.
alter table public.site_offer_settings
  add column if not exists led_sjs_1x2_price numeric(12,2) not null default 0 check (led_sjs_1x2_price >= 0),
  add column if not exists led_sjs_1x2_combo_discount numeric(12,2) not null default 50 check (led_sjs_1x2_combo_discount >= 0),
  add column if not exists led_praia_grande_1x2_price numeric(12,2) not null default 0 check (led_praia_grande_1x2_price >= 0),
  add column if not exists led_praia_grande_1x2_combo_discount numeric(12,2) not null default 50 check (led_praia_grande_1x2_combo_discount >= 0),
  add column if not exists led_passo_torres_1x2_price numeric(12,2) not null default 0 check (led_passo_torres_1x2_price >= 0),
  add column if not exists led_passo_torres_1x2_combo_discount numeric(12,2) not null default 50 check (led_passo_torres_1x2_combo_discount >= 0),
  add column if not exists led_sjs_4x2_price numeric(12,2) not null default 0 check (led_sjs_4x2_price >= 0),
  add column if not exists led_sjs_4x2_combo_discount numeric(12,2) not null default 50 check (led_sjs_4x2_combo_discount >= 0);

comment on column public.site_offer_settings.led_sjs_1x2_price is 'Valor do painel 1x2 m em São João do Sul. Zero oculta a opção no site.';
comment on column public.site_offer_settings.led_praia_grande_1x2_price is 'Valor do painel 1x2 m em Praia Grande/SC. Zero oculta a opção no site.';
comment on column public.site_offer_settings.led_passo_torres_1x2_price is 'Valor do painel 1x2 m em Passo de Torres/SC. Zero oculta a opção no site.';
comment on column public.site_offer_settings.led_sjs_4x2_price is 'Valor do painel 4x2 m na entrada de São João do Sul. Zero oculta a opção no site.';

-- Seed de public.commercial_products (painéis LED individuais) MOVIDO para
-- 20261028100050_commercial_products_seed.sql em 17/10/2026 (preparação de
-- publicação) — mesmo motivo do bloco já movido de
-- 20261012195906_site_interest_requests.sql: commercial_products só existe
-- a partir de 20261028100000_comercial_publicidade.sql, 16 dias depois
-- deste arquivo; um fresh install falhava aqui. Nunca renomear ESTE
-- arquivo — já aplicado no histórico remoto sob este nome exato.

create or replace function public.sync_site_offer_settings_to_commercial_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.commercial_products set suggested_price = new.print_business_card_price
   where lower(name)=lower('Jornal impresso — Cartão de visita');
  update public.commercial_products set suggested_price = new.print_standard_price
   where lower(name)=lower('Jornal impresso — Padrão');
  update public.commercial_products set suggested_price = new.print_quarter_price
   where lower(name)=lower('Jornal impresso — 1/4 de página');
  update public.commercial_products set suggested_price = new.print_half_price
   where lower(name)=lower('Jornal impresso — Meia página');
  update public.commercial_products set suggested_price = new.print_full_price
   where lower(name)=lower('Jornal impresso — Página inteira');

  update public.commercial_products set suggested_price = new.led_sjs_1x2_price
   where lower(name)=lower('Painel LED 1x2 m — São João do Sul');
  update public.commercial_products set suggested_price = new.led_praia_grande_1x2_price
   where lower(name)=lower('Painel LED 1x2 m — Praia Grande');
  update public.commercial_products set suggested_price = new.led_passo_torres_1x2_price
   where lower(name)=lower('Painel LED 1x2 m — Passo de Torres');
  update public.commercial_products set suggested_price = new.led_sjs_4x2_price
   where lower(name)=lower('Painel LED 4x2 m — Entrada de São João do Sul');

  -- Mantém o produto legado sincronizado enquanto existir no catálogo.
  update public.commercial_products set suggested_price = new.led_three_cities_price
   where lower(name)=lower('Painéis LED — São João do Sul + Praia Grande + Passo de Torres');
  return new;
end;
$$;

-- 2) Solicitações: endereço, preferência de pagamento e análise de disponibilidade.
alter table public.site_interest_requests
  add column if not exists payment_preference text,
  add column if not exists address_zip text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_neighborhood text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists availability_status text not null default 'pending',
  add column if not exists approved_total numeric(12,2),
  add column if not exists admin_note text;

alter table public.site_interest_requests
  drop constraint if exists site_interest_requests_payment_preference_check,
  add constraint site_interest_requests_payment_preference_check
    check (payment_preference is null or payment_preference in ('pix','boleto','credit_card','cash','to_define')),
  drop constraint if exists site_interest_requests_availability_status_check,
  add constraint site_interest_requests_availability_status_check
    check (availability_status in ('pending','approved','unavailable','needs_info')),
  drop constraint if exists site_interest_requests_approved_total_check,
  add constraint site_interest_requests_approved_total_check
    check (approved_total is null or approved_total >= 0);

create index if not exists site_interest_requests_availability_idx
  on public.site_interest_requests (availability_status, created_at desc);

create or replace function public.submit_site_interest_request_v2(
  p_request_type text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_company text default null,
  p_selections jsonb default '[]'::jsonb,
  p_estimated_total numeric default null,
  p_notes text default null,
  p_payment_preference text default 'to_define',
  p_address_zip text default null,
  p_address_street text default null,
  p_address_number text default null,
  p_address_complement text default null,
  p_address_neighborhood text default null,
  p_address_city text default null,
  p_address_state text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name,''));
  v_phone text := btrim(coalesce(p_phone,''));
  v_email text := nullif(btrim(coalesce(p_email,'')),'');
  v_company text := nullif(btrim(coalesce(p_company,'')),'');
  v_notes text := nullif(btrim(coalesce(p_notes,'')),'');
  v_zip text := nullif(btrim(coalesce(p_address_zip,'')),'');
  v_street text := nullif(btrim(coalesce(p_address_street,'')),'');
  v_number text := nullif(btrim(coalesce(p_address_number,'')),'');
  v_complement text := nullif(btrim(coalesce(p_address_complement,'')),'');
  v_neighborhood text := nullif(btrim(coalesce(p_address_neighborhood,'')),'');
  v_city text := nullif(btrim(coalesce(p_address_city,'')),'');
  v_state text := upper(nullif(btrim(coalesce(p_address_state,'')),''));
begin
  if p_request_type not in ('subscription','advertising','mixed') then
    raise exception 'Tipo de solicitação inválido.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Nome inválido.';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 40 then
    raise exception 'Telefone inválido.';
  end if;
  if p_payment_preference not in ('pix','boleto','credit_card','cash','to_define') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array'
     or jsonb_array_length(p_selections) = 0 or jsonb_array_length(p_selections) > 12 then
    raise exception 'Seleções inválidas.';
  end if;
  if p_estimated_total is not null and (p_estimated_total < 0 or p_estimated_total > 1000000) then
    raise exception 'Valor estimado inválido.';
  end if;

  -- Assinatura precisa de endereço para a equipe validar a rota de entrega.
  if p_request_type in ('subscription','mixed') then
    if v_zip is null or v_street is null or v_number is null or
       v_neighborhood is null or v_city is null or v_state is null then
      raise exception 'Informe o endereço completo para análise da rota de entrega.';
    end if;
  end if;

  insert into public.site_interest_requests (
    request_type, name, phone, email, city, company,
    selections, estimated_total, notes, payment_preference,
    address_zip, address_street, address_number, address_complement,
    address_neighborhood, address_city, address_state
  ) values (
    p_request_type, v_name, v_phone, v_email, v_city, v_company,
    p_selections, p_estimated_total, v_notes, p_payment_preference,
    v_zip, v_street, v_number, v_complement,
    v_neighborhood, v_city, v_state
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_site_interest_request_v2(
  text,text,text,text,text,jsonb,numeric,text,text,text,text,text,text,text,text,text
) from public;
grant execute on function public.submit_site_interest_request_v2(
  text,text,text,text,text,jsonb,numeric,text,text,text,text,text,text,text,text,text
) to anon, authenticated;

-- 3) Configuração central do provedor de cobrança.
create table if not exists public.billing_provider_settings (
  id smallint primary key default 1 check (id=1),
  provider text not null default 'asaas' check (provider in ('asaas')),
  environment text not null default 'sandbox' check (environment in ('sandbox','production')),
  enabled boolean not null default false,
  allow_pix boolean not null default true,
  allow_boleto boolean not null default true,
  allow_credit_card boolean not null default false,
  allow_cash boolean not null default true,
  default_due_days integer not null default 3 check (default_due_days between 0 and 60),
  finance_whatsapp text,
  auto_send_after_approval boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.billing_provider_settings (id) values (1)
on conflict (id) do nothing;

drop trigger if exists billing_provider_settings_set_updated_at on public.billing_provider_settings;
create trigger billing_provider_settings_set_updated_at
  before update on public.billing_provider_settings
  for each row execute function public.set_updated_at();

create or replace function public.set_billing_provider_settings_actor()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists billing_provider_settings_set_actor on public.billing_provider_settings;
create trigger billing_provider_settings_set_actor
  before update on public.billing_provider_settings
  for each row execute function public.set_billing_provider_settings_actor();

alter table public.billing_provider_settings enable row level security;

drop policy if exists billing_provider_settings_staff_select on public.billing_provider_settings;
create policy billing_provider_settings_staff_select
  on public.billing_provider_settings for select to authenticated
  using (public.is_active_staff());

drop policy if exists billing_provider_settings_staff_update on public.billing_provider_settings;
create policy billing_provider_settings_staff_update
  on public.billing_provider_settings for update to authenticated
  using (public.is_active_staff()) with check (public.is_active_staff());

comment on table public.billing_provider_settings is
  'Configuração operacional central de cobranças. Chaves API e token de webhook NÃO são armazenados aqui; ficam em variáveis de ambiente/secret store.';

-- Os dois blocos finais originais (coluna asaas_customer_id em
-- public.clients + constraint de provider em public.payment_charges) MOVIDOS
-- para 20261027100150_billing_provider_deferred_fixes.sql em 17/10/2026
-- (preparação de publicação) — public.clients só existe a partir de
-- 20261014110000_clients.sql (2 dias depois deste arquivo) e
-- public.payment_charges só existe a partir de
-- 20261027100100_payment_charges.sql (15 dias depois); um fresh install
-- falhava aqui. Nunca renomear ESTE arquivo — já aplicado no histórico
-- remoto sob este nome exato.
