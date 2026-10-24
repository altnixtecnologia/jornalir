-- Patrocinadores: vitrine de bônus, exclusivamente seleção manual.
-- Preserve o que estava efetivamente visível na virada desta migração:
-- futuros/expirados passam para pausados; nenhum anúncio oculto reaparece.
-- Antigos prazos deixam de comandar exibição; colunas permanecem por
-- compatibilidade de histórico/esquema, mas sua aplicação deixa de usá-las.
-- O trigger de operador não se aplica a migração controlada do esquema.
alter table public.site_ad_media disable trigger zz_guard_site_ad_publication;
update public.site_ad_media
set active=false
where active=true
 and (
 (active_from is not null and active_from > (now() at time zone 'America/Sao_Paulo')::date)
 or (active_until is not null and active_until < (now() at time zone 'America/Sao_Paulo')::date)
 );
update public.site_ad_media
set active_from=null,active_until=null
where active_from is not null or active_until is not null;
alter table public.site_ad_media enable trigger zz_guard_site_ad_publication;

create or replace view public.public_site_ad_media as
select s.slot_number,
       m.id,
       ma.public_url as image_url,
       coalesce(m.alt_text,ma.alt_text) as alt_text,
       m.href,m.sort_order,
       coalesce(m.rotation_interval_ms,s.rotation_interval_ms) as rotation_interval_ms,
       coalesce(m.transition_effect,s.transition_effect) as transition_effect,
       coalesce(m.fit_mode,s.fit_mode) as fit_mode
from public.site_ad_media m
join public.site_ad_slots s on s.id=m.slot_id and s.active=true
join public.media_assets ma on ma.id=m.media_asset_id
where m.active=true
order by s.slot_number,m.sort_order;
grant select on public.public_site_ad_media to anon,authenticated;
comment on view public.public_site_ad_media is
 'Patrocinadores gratuitos: lista manual de imagens ativas, sem prazo automático ou relação financeira.';
