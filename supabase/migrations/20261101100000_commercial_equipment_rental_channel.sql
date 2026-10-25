-- Locacao de equipamentos: modalidade no catalogo ja compartilhado pelo Comercial.
-- Nao gera contrato juridico automaticamente e NAO cria cobrancas.
-- Equipamentos fisicos/seriais, entrega e devolucao serao registrados em
-- entidade operacional propria antes do fluxo definitivo de assinatura.
alter table public.commercial_products
  drop constraint if exists commercial_products_channel_check;
alter table public.commercial_products
  add constraint commercial_products_channel_check
    check (channel in ('newspaper','website','led_panel','social_media','package','equipment_rental','other'));

comment on column public.commercial_products.channel is
  'Canal comercial. equipment_rental = plano/produto de locacao; equipamento individual/numero de serie e condicoes de entrega precisam ser conferidos no contrato especifico.';
