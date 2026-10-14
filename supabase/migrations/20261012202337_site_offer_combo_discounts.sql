alter table public.site_offer_settings
  add column annual_subscription_combo_discount numeric(12, 2) not null default 50
    check (annual_subscription_combo_discount >= 0),
  add column print_business_card_combo_discount numeric(12, 2) not null default 50
    check (print_business_card_combo_discount >= 0),
  add column print_standard_combo_discount numeric(12, 2) not null default 50
    check (print_standard_combo_discount >= 0),
  add column print_quarter_combo_discount numeric(12, 2) not null default 50
    check (print_quarter_combo_discount >= 0),
  add column print_half_combo_discount numeric(12, 2) not null default 50
    check (print_half_combo_discount >= 0),
  add column print_full_combo_discount numeric(12, 2) not null default 50
    check (print_full_combo_discount >= 0),
  add column led_three_cities_combo_discount numeric(12, 2) not null default 50
    check (led_three_cities_combo_discount >= 0);

comment on column public.site_offer_settings.annual_subscription_combo_discount is
  'Desconto aplicado a este produto quando o carrinho tiver 2 ou mais produtos.';
comment on column public.site_offer_settings.print_business_card_combo_discount is
  'Desconto aplicado ao cartão de visita quando o carrinho tiver 2 ou mais produtos.';
comment on column public.site_offer_settings.print_standard_combo_discount is
  'Desconto aplicado ao formato padrão quando o carrinho tiver 2 ou mais produtos.';
comment on column public.site_offer_settings.print_quarter_combo_discount is
  'Desconto aplicado ao 1/4 de página quando o carrinho tiver 2 ou mais produtos.';
comment on column public.site_offer_settings.print_half_combo_discount is
  'Desconto aplicado à meia página quando o carrinho tiver 2 ou mais produtos.';
comment on column public.site_offer_settings.print_full_combo_discount is
  'Desconto aplicado à página inteira quando o carrinho tiver 2 ou mais produtos.';
comment on column public.site_offer_settings.led_three_cities_combo_discount is
  'Desconto aplicado ao pacote dos 3 painéis quando o carrinho tiver 2 ou mais produtos.';
