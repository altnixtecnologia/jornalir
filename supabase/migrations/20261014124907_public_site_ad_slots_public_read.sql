-- GUARDA adicionada em 17/10/2026 (reconciliação de histórico): depende
-- da view public.public_site_ad_slots (criada por
-- 20261014022359_public_site_ad_slots_transition.sql/
-- 20261014124630_site_ads_managed_slot_persistence.sql, ambas guardadas
-- pela mesma razão — ver nota lá). Ver
-- 20261014015734_site_ads_per_slot_rotation.sql (mesma família).
do $$
begin
  if to_regclass('public.public_site_ad_slots') is not null then
    alter view public.public_site_ad_slots set (security_invoker = false);
    comment on view public.public_site_ad_slots is 'Somente configuracoes publicas das seis posicoes; a view nao expoe IDs internos ou dados de clientes.';
  end if;
end $$;
