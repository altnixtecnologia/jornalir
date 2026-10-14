alter table public.site_ad_slots add column if not exists managed_by_panel boolean not null default false;
update public.site_ad_slots s set managed_by_panel = true where exists (select 1 from public.site_ad_media m where m.slot_id=s.id);
create or replace function public.mark_site_ad_slot_managed() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.site_ad_slots set managed_by_panel = true where id = new.slot_id;
  return new;
end; $$;
drop trigger if exists trg_site_ad_slot_managed on public.site_ad_media;
create trigger trg_site_ad_slot_managed after insert on public.site_ad_media for each row execute function public.mark_site_ad_slot_managed();
create or replace view public.public_site_ad_slots with (security_invoker = true) as
select s.slot_number, s.active, s.rotation_interval_ms, s.transition_effect, s.fit_mode,
exists (select 1 from public.site_ad_media m where m.slot_id = s.id) as has_media,
s.managed_by_panel
from public.site_ad_slots s order by s.slot_number;
grant select on public.public_site_ad_slots to anon, authenticated;
