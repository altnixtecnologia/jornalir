-- Configuração individual por imagem (duração/proporção/efeito) na
-- publicidade do site — pedido explícito do usuário em 17/10/2026:
-- "configurações individuais por imagem (duração, proporção, efeito e
-- ordem), com persistência e funcionamento real das transições".
-- Incremental sobre 20261014000000_site_ad_slots.sql +
-- 20261014015734_site_ads_per_slot_rotation.sql. NÃO aplicada ainda
-- (local apenas).
--
-- "Ordem" já é por imagem desde a criação de site_ad_media (sort_order,
-- gerenciada por reorder_site_ad_media) — não precisa de coluna nova.
-- As 3 colunas abaixo são NULLABLE: null significa "usar o valor da
-- POSIÇÃO" (site_ad_slots.rotation_interval_ms/transition_effect/
-- fit_mode) — nunca obrigamos o operador a configurar as 3 em toda
-- imagem só para manter o comportamento atual (todas as imagens da
-- mesma posição continuam girando igual, por padrão).
alter table public.site_ad_media
  add column if not exists rotation_interval_ms int,
  add column if not exists transition_effect text,
  add column if not exists fit_mode text;

alter table public.site_ad_media
  drop constraint if exists site_ad_media_rotation_interval_ms_check,
  add constraint site_ad_media_rotation_interval_ms_check
    check (rotation_interval_ms is null or (rotation_interval_ms between 2000 and 120000)),
  drop constraint if exists site_ad_media_transition_effect_check,
  add constraint site_ad_media_transition_effect_check
    check (transition_effect is null or transition_effect in ('none', 'fade', 'slide-left', 'slide-up', 'zoom-in', 'crossfade')),
  drop constraint if exists site_ad_media_fit_mode_check,
  add constraint site_ad_media_fit_mode_check
    check (fit_mode is null or fit_mode in ('contain', 'stretch'));

comment on column public.site_ad_media.rotation_interval_ms is
  'Duração individual desta imagem antes de avançar para a próxima da playlist — null usa o tempo da posição (site_ad_slots.rotation_interval_ms).';
comment on column public.site_ad_media.transition_effect is
  'Efeito de transição individual desta imagem — null usa o efeito da posição (site_ad_slots.transition_effect). Mesmos 6 valores aceitos pela posição (site_ad_media_transition_effect_check), para o site renderizar com a mesma lista de efeitos conhecida.';
comment on column public.site_ad_media.fit_mode is
  'Proporção/encaixe individual desta imagem — null usa o formato da posição (site_ad_slots.fit_mode).';

-- A view pública passa a expor o valor EFETIVO já resolvido (COALESCE
-- imagem -> posição) — o site público nunca precisa saber se o valor
-- veio de uma configuração individual ou do padrão da posição, só
-- consome o resultado já resolvido (mesmo princípio de simplicidade das
-- views public_* já existentes).
create or replace view public.public_site_ad_media as
  select
    s.slot_number,
    m.id,
    ma.public_url as image_url,
    coalesce(m.alt_text, ma.alt_text) as alt_text,
    m.href,
    m.sort_order,
    coalesce(m.rotation_interval_ms, s.rotation_interval_ms) as rotation_interval_ms,
    coalesce(m.transition_effect, s.transition_effect) as transition_effect,
    coalesce(m.fit_mode, s.fit_mode) as fit_mode
  from public.site_ad_media m
  join public.site_ad_slots s on s.id = m.slot_id and s.active = true
  join public.media_assets ma on ma.id = m.media_asset_id
  where m.active = true
    and (m.active_from is null or m.active_from <= current_date)
    and (m.active_until is null or m.active_until >= current_date)
  order by s.slot_number, m.sort_order;

grant select on public.public_site_ad_media to anon, authenticated;

comment on view public.public_site_ad_media is
  'Leitura pública da playlist de cada posição — rotation_interval_ms/transition_effect/fit_mode já resolvidos (COALESCE da imagem individual com o padrão da posição); o site nunca recalcula esse fallback.';
