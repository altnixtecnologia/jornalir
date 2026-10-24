-- Patrocinadores do portal: veiculação controlada por staff de Publicidade.
-- A imagem pode ser uma cortesia; NÃO inferir inadimplência de outra venda.
-- Protege atualizações DIRETAS de active/vigência via PostgREST, não só UI.
create or replace function public.guard_site_ad_publication_permission()
returns trigger language plpgsql set search_path = ''
as $$
begin
 if (new.active is distinct from old.active or
     new.active_from is distinct from old.active_from or
     new.active_until is distinct from old.active_until)
   and not (
     public.is_active_admin_or_owner()
     or public.staff_can_module_action('publicidade','vendas_editar')
   )
 then
   raise exception 'Sem permissão para alterar a veiculação da mídia.';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_site_ad_publication_permission() from public, anon, authenticated;
create trigger zz_guard_site_ad_publication
before update on public.site_ad_media
for each row execute function public.guard_site_ad_publication_permission();

-- O dia da veiculação segue America/Sao_Paulo (e não o UTC de Postgres).
-- Reproduz colunas/COALESCE da view existente; não adiciona dados privados.
create or replace view public.public_site_ad_media as
select s.slot_number,
       m.id,
       ma.public_url as image_url,
       coalesce(m.alt_text, ma.alt_text) as alt_text,
       m.href,
       m.sort_order,
       coalesce(m.rotation_interval_ms,s.rotation_interval_ms) as rotation_interval_ms,
       coalesce(m.transition_effect,s.transition_effect) as transition_effect,
       coalesce(m.fit_mode,s.fit_mode) as fit_mode
from public.site_ad_media m
join public.site_ad_slots s on s.id=m.slot_id and s.active=true
join public.media_assets ma on ma.id=m.media_asset_id
where m.active=true
 and (m.active_from is null or m.active_from <= (now() at time zone 'America/Sao_Paulo')::date)
 and (m.active_until is null or m.active_until >= (now() at time zone 'America/Sao_Paulo')::date)
order by s.slot_number,m.sort_order;
grant select on public.public_site_ad_media to anon, authenticated;
comment on view public.public_site_ad_media is
 'Playlist pública de 6 posições com vigência no calendário de São Paulo, configuração individual por imagem e sem efeitos automáticos de inadimplência.';
