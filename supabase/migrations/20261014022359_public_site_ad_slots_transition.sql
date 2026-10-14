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
order by s.slot_number;

grant select on public.public_site_ad_slots to anon, authenticated;

comment on view public.public_site_ad_slots is
  'Configuração pública não sensível das 6 posições de publicidade. has_media permite transição segura do acervo legado para o gerenciador sem ressuscitar anúncios quando uma posição é desativada.';
