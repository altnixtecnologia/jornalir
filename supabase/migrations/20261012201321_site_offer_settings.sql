create table public.site_offer_settings (
  id smallint primary key default 1 check (id = 1),
  annual_subscription_price numeric(12, 2) check (annual_subscription_price is null or annual_subscription_price >= 0),
  print_business_card_price numeric(12, 2) not null default 130 check (print_business_card_price >= 0),
  print_standard_price numeric(12, 2) not null default 180 check (print_standard_price >= 0),
  print_quarter_price numeric(12, 2) not null default 350 check (print_quarter_price >= 0),
  print_half_price numeric(12, 2) not null default 700 check (print_half_price >= 0),
  print_full_price numeric(12, 2) not null default 1200 check (print_full_price >= 0),
  led_three_cities_price numeric(12, 2) not null default 800 check (led_three_cities_price >= 0),
  combo_business_card_led_price numeric(12, 2) not null default 900 check (combo_business_card_led_price >= 0),
  combo_standard_led_price numeric(12, 2) not null default 950 check (combo_standard_led_price >= 0),
  combo_quarter_led_price numeric(12, 2) not null default 1100 check (combo_quarter_led_price >= 0),
  combo_half_led_price numeric(12, 2) not null default 1450 check (combo_half_led_price >= 0),
  combo_full_led_price numeric(12, 2) not null default 1950 check (combo_full_led_price >= 0),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

comment on table public.site_offer_settings is
  'Registro único com os valores públicos da página /assine. annual_subscription_price nulo significa "Sob consulta".';

insert into public.site_offer_settings (id) values (1)
on conflict (id) do nothing;

create trigger site_offer_settings_set_updated_at
  before update on public.site_offer_settings
  for each row execute function public.set_updated_at();

create or replace function public.set_site_offer_settings_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger site_offer_settings_set_actor
  before update on public.site_offer_settings
  for each row execute function public.set_site_offer_settings_actor();

alter table public.site_offer_settings enable row level security;

create policy site_offer_settings_public_select
  on public.site_offer_settings for select
  to anon, authenticated
  using (true);

create policy site_offer_settings_staff_update
  on public.site_offer_settings for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create or replace function public.sync_site_offer_settings_to_commercial_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.commercial_products set suggested_price = new.print_business_card_price
   where lower(name) = lower('Jornal impresso — Cartão de visita');
  update public.commercial_products set suggested_price = new.print_standard_price
   where lower(name) = lower('Jornal impresso — Padrão');
  update public.commercial_products set suggested_price = new.print_quarter_price
   where lower(name) = lower('Jornal impresso — 1/4 de página');
  update public.commercial_products set suggested_price = new.print_half_price
   where lower(name) = lower('Jornal impresso — Meia página');
  update public.commercial_products set suggested_price = new.print_full_price
   where lower(name) = lower('Jornal impresso — Página inteira');
  update public.commercial_products set suggested_price = new.led_three_cities_price
   where lower(name) = lower('Painéis LED — São João do Sul + Praia Grande + Passo de Torres');
  return new;
end;
$$;

create trigger site_offer_settings_sync_products
  after update on public.site_offer_settings
  for each row execute function public.sync_site_offer_settings_to_commercial_products();
