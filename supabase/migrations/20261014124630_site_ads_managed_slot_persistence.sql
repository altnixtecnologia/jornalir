-- GUARDA adicionada em 17/10/2026 (reconciliação de histórico): depende
-- de public.site_ad_slots/site_ad_media, criadas em
-- 20261029100200_site_ad_slots.sql (posterior a este arquivo). Ver nota
-- em 20261014015734_site_ads_per_slot_rotation.sql (mesma família).
do $$
begin
  if to_regclass('public.site_ad_slots') is not null then
    alter table public.site_ad_slots add column if not exists managed_by_panel boolean not null default false;
    update public.site_ad_slots s set managed_by_panel = true where exists (select 1 from public.site_ad_media m where m.slot_id=s.id);

    create or replace function public.mark_site_ad_slot_managed() returns trigger language plpgsql security invoker set search_path = '' as $f$
    begin
      update public.site_ad_slots set managed_by_panel = true where id = new.slot_id;
      return new;
    end; $f$;

    drop trigger if exists trg_site_ad_slot_managed on public.site_ad_media;
    create trigger trg_site_ad_slot_managed after insert on public.site_ad_media for each row execute function public.mark_site_ad_slot_managed();

    execute $view$
      create or replace view public.public_site_ad_slots with (security_invoker = true) as
      select s.slot_number, s.active, s.rotation_interval_ms, s.transition_effect, s.fit_mode,
      exists (select 1 from public.site_ad_media m where m.slot_id = s.id) as has_media,
      s.managed_by_panel
      from public.site_ad_slots s order by s.slot_number
    $view$;

    grant select on public.public_site_ad_slots to anon, authenticated;
  end if;
end $$;
