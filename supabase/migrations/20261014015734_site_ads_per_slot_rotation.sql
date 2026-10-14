alter table public.site_ad_slots
  add column if not exists rotation_interval_ms integer not null default 10000,
  add column if not exists transition_effect text not null default 'fade',
  add column if not exists fit_mode text not null default 'contain';

update public.site_ad_slots
set
  rotation_interval_ms = coalesce(
    (select rotation_interval_ms from public.site_ad_settings order by updated_at desc limit 1),
    rotation_interval_ms
  ),
  transition_effect = case
    when coalesce((select transition_effect from public.site_ad_settings order by updated_at desc limit 1), 'fade')
         in ('fade','slide-left','slide-up','zoom-in','crossfade')
      then coalesce((select transition_effect from public.site_ad_settings order by updated_at desc limit 1), 'fade')
    else 'fade'
  end;

alter table public.site_ad_slots
  drop constraint if exists site_ad_slots_rotation_interval_ms_check,
  add constraint site_ad_slots_rotation_interval_ms_check
    check (rotation_interval_ms between 2000 and 120000),
  drop constraint if exists site_ad_slots_transition_effect_check,
  add constraint site_ad_slots_transition_effect_check
    check (transition_effect in ('none','fade','slide-left','slide-up','zoom-in','crossfade')),
  drop constraint if exists site_ad_slots_fit_mode_check,
  add constraint site_ad_slots_fit_mode_check
    check (fit_mode in ('contain','stretch'));

comment on column public.site_ad_slots.rotation_interval_ms is
  'Tempo de exibição de cada arte nesta posição antes de avançar para a próxima.';
comment on column public.site_ad_slots.transition_effect is
  'Efeito usado nesta posição ao trocar de arte.';
comment on column public.site_ad_slots.fit_mode is
  'contain mantém a proporção dentro do quadro; stretch estica a arte para preencher o quadro.';

create or replace view public.public_site_ad_media as
  select
    s.slot_number,
    m.id,
    ma.public_url as image_url,
    coalesce(m.alt_text, ma.alt_text) as alt_text,
    m.href,
    m.sort_order,
    s.rotation_interval_ms,
    s.transition_effect,
    s.fit_mode
  from public.site_ad_media m
  join public.site_ad_slots s on s.id = m.slot_id and s.active = true
  join public.media_assets ma on ma.id = m.media_asset_id
  where m.active = true
    and (m.active_from is null or m.active_from <= current_date)
    and (m.active_until is null or m.active_until >= current_date)
  order by s.slot_number, m.sort_order;

grant select on public.public_site_ad_media to anon, authenticated;
