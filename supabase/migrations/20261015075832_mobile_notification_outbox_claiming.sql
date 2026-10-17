-- Outbox claimed atomically; stale claims can be reclaimed after 10 minutes.
alter table public.notification_outbox add column if not exists processing_started_at timestamptz;
create or replace function public.claim_notification_outbox(p_limit integer default 10)
returns setof public.notification_outbox language plpgsql security invoker set search_path=''
as $$
begin
 if p_limit not between 1 and 25 then raise exception 'Invalid batch size'; end if;
 return query
 with candidates as (
   select id from public.notification_outbox
   where due_at <= now()
     and attempts < 5
     and (
       status in ('pending','failed')
       or (status='processing' and processing_started_at < now()-interval '10 minutes')
     )
   order by due_at,created_at
   limit p_limit
   for update skip locked
 )
 update public.notification_outbox o
   set status='processing',processing_started_at=now(),attempts=o.attempts+1
 from candidates where o.id=candidates.id
 returning o.*;
end $$;
revoke all on function public.claim_notification_outbox(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_outbox(integer) to service_role;
;
