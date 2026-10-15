-- Enfileira mensagens do portal público por assinante no momento da publicação.
alter table public.site_push_deliveries drop constraint if exists site_push_deliveries_status_check;
alter table public.site_push_deliveries add constraint site_push_deliveries_status_check
check(status in ('pending','sending','sent','failed','expired'));

create or replace function public.queue_site_push_event()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.app_kind='site' and new.kind in ('ordinary','urgent') then
   insert into public.site_push_deliveries(event_id,subscription_id,status)
   select new.id,s.id,'pending'
   from public.site_push_subscriptions s
   where s.enabled and
     case when new.kind='urgent' then s.urgent_enabled else s.ordinary_enabled end
   on conflict(event_id,subscription_id) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists trg_queue_site_push_event on public.notification_events;
create trigger trg_queue_site_push_event after insert on public.notification_events
for each row execute function public.queue_site_push_event();

create or replace function public.claim_site_push_deliveries(p_limit integer default 20)
returns table(delivery_id uuid,event_id uuid,subscription_id uuid)
language plpgsql security definer set search_path=''
as $$
begin
 return query
 with picked as (
   select d.id
   from public.site_push_deliveries d
   join public.notification_events e on e.id=d.event_id
   where d.status='pending' and e.app_kind='site'
     and e.scheduled_at<=now()
     and (
       (e.kind='urgent' and e.scheduled_at >= now()-interval '1 hour')
       or (e.kind='ordinary' and e.scheduled_at >= now()-interval '24 hours')
     )
   order by (e.kind='urgent') desc,e.scheduled_at asc,d.attempted_at asc
   for update of d skip locked
   limit least(greatest(p_limit,1),100)
 )
 update public.site_push_deliveries d set status='sending',attempted_at=now()
 from picked where d.id=picked.id
 returning d.id,d.event_id,d.subscription_id;
end $$;
revoke all on function public.queue_site_push_event() from public,anon,authenticated;
revoke all on function public.claim_site_push_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_site_push_deliveries(integer) to service_role;
