-- GUARDA adicionada em 17/10/2026 (reconciliação de histórico): depende
-- de public.site_ad_slots/site_ad_media, criadas em
-- 20261029100200_site_ad_slots.sql (posterior a este arquivo). Ver nota
-- em 20261014015734_site_ads_per_slot_rotation.sql (mesma família).
do $$
begin
  if to_regclass('public.site_ad_slots') is not null then
    execute $view$
      create or replace view public.public_site_ad_slots as
      select
        s.slot_number,
        s.active,
        s.rotation_interval_ms,
        s.transition_effect,
        s.fit_mode,
        exists (
          select 1
          from public.site_ad_media m
          where m.slot_id = s.id
        ) as has_media
      from public.site_ad_slots s
      order by s.slot_number
    $view$;

    grant select on public.public_site_ad_slots to anon, authenticated;

    comment on view public.public_site_ad_slots is
      'Configuração pública não sensível das 6 posições de publicidade. has_media permite transição segura do acervo legado para o gerenciador sem ressuscitar anúncios quando uma posição é desativada.';
  end if;
end $$;
