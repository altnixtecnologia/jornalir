-- Claims for all subscribers, across pages, without losing audiences >100.
create or replace function public.list_undelivered_mobile_subscriptions(
  p_event_id uuid,p_limit integer default 10
) returns table (
  id uuid, endpoint text,p256dh text,auth_secret text
) language plpgsql security invoker set search_path=''
as $$
begin
 if p_limit not between 1 and 25 then raise exception 'Invalid push batch size'; end if;
 return query
 select s.id,s.endpoint,s.p256dh,s.auth_secret
 from public.notification_outbox e
 join public.notification_push_subscriptions s on s.enabled
   and (
     (e.kind='news' and s.app_kind='site' and s.news_opt_in)
     or (e.kind='urgent' and s.app_kind='site' and s.urgent_opt_in)
     or (e.kind in ('agenda','system') and s.app_kind='sistema' and s.agenda_opt_in
         and s.profile_id=e.target_profile_id)
   )
 where e.id=p_event_id and not exists (
   select 1 from public.notification_push_deliveries d
   where d.event_id=e.id and d.subscription_id=s.id
     and d.status in ('pending','sent','gone','uncertain')
 )
 order by s.created_at,s.id limit p_limit;
end $$;
revoke all on function public.list_undelivered_mobile_subscriptions(uuid,integer) from public,anon,authenticated;
grant execute on function public.list_undelivered_mobile_subscriptions(uuid,integer) to service_role;

-- Batch processing may need many minutes even without failure. Unlimited
-- pending batches, bounded retries of failed or stuck event claims.
create or replace function public.claim_notification_outbox(p_limit integer default 10)
returns setof public.notification_outbox language plpgsql security invoker set search_path=''
as $$
begin
 if p_limit not between 1 and 25 then raise exception 'Invalid batch size';end if;
 return query
 with candidates as (
   select id from public.notification_outbox
   where due_at<=now() and (
     status='pending'
     or (status='failed' and attempts<5)
     or (status='processing' and processing_started_at<now()-interval '10 minutes')
   )
   order by due_at,created_at
   limit p_limit for update skip locked
 )
 update public.notification_outbox o
 set status='processing',processing_started_at=now(),attempts=least(32000,o.attempts+1)
 from candidates where o.id=candidates.id returning o.*;
end $$;
revoke all on function public.claim_notification_outbox(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_outbox(integer) to service_role;
;
