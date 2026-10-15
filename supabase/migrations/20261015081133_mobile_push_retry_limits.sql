alter table public.notification_outbox
 drop constraint if exists notification_outbox_attempts_check;
alter table public.notification_outbox
 add constraint notification_outbox_attempts_check check(attempts between 0 and 32000);

create or replace function public.list_undelivered_mobile_subscriptions(
  p_event_id uuid,p_limit integer default 10
) returns table (
 id uuid,endpoint text,p256dh text,auth_secret text
) language plpgsql security invoker set search_path=''
as $$
begin
 if p_limit not between 1 and 25 then raise exception 'Invalid push batch size';end if;
 return query
 select s.id,s.endpoint,s.p256dh,s.auth_secret
 from public.notification_outbox e
 join public.notification_push_subscriptions s on s.enabled and (
   (e.kind='news' and s.app_kind='site' and s.news_opt_in)
   or (e.kind='urgent' and s.app_kind='site' and s.urgent_opt_in)
   or (e.kind in ('agenda','system') and s.app_kind='sistema'
     and s.agenda_opt_in and s.profile_id=e.target_profile_id)
 )
 where e.id=p_event_id and not exists (
   select 1 from public.notification_push_deliveries d
   where d.event_id=e.id and d.subscription_id=s.id
     and (d.status in ('pending','sent','gone','uncertain')
       or (d.status='failed' and d.attempts>=3))
 )
 order by s.created_at,s.id limit p_limit;
end $$;
revoke all on function public.list_undelivered_mobile_subscriptions(uuid,integer) from public,anon,authenticated;
grant execute on function public.list_undelivered_mobile_subscriptions(uuid,integer) to service_role;