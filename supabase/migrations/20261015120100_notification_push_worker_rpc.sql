-- Processador do Web Push: fan-out atomico e entregas com reserva exclusiva.
-- Nenhuma rotina dispara mensagens externas nesta migration.
alter table public.notification_push_deliveries
  add column if not exists processing_started_at timestamptz;
alter table public.notification_push_deliveries
  drop constraint if exists notification_push_deliveries_status_check;
alter table public.notification_push_deliveries
  add constraint notification_push_deliveries_status_check
  check (status in ('pending','processing','sent','failed','gone','uncertain'));

create index if not exists notification_push_deliveries_ready_idx
  on public.notification_push_deliveries(status,attempts)
  where status in ('pending','failed');

create or replace function public.expand_notification_outbox(p_limit integer default 10)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare
  current_event public.notification_outbox%rowtype;
  expanded integer := 0;
begin
  for current_event in
    select * from public.notification_outbox
    where status in ('pending','failed') and due_at<=now() and attempts<4
    order by due_at,id
    limit least(greatest(coalesce(p_limit,10),1),25)
    for update skip locked
  loop
    insert into public.notification_push_deliveries(event_id,subscription_id)
    select current_event.id,s.id
      from public.notification_push_subscriptions s
     where s.enabled
       and (
          (current_event.kind = 'news' and s.app_kind='site' and s.news_opt_in)
          or (current_event.kind = 'urgent' and s.app_kind='site' and s.urgent_opt_in)
          or (current_event.kind = 'agenda' and s.app_kind='sistema'
                and s.profile_id=current_event.target_profile_id and s.agenda_opt_in)
          or (current_event.kind = 'system' and s.app_kind='sistema'
                and s.profile_id=current_event.target_profile_id)
       )
    on conflict (event_id, subscription_id) do nothing;

    update public.notification_outbox
       set status='completed',processed_at=now(),processing_started_at=null,
           attempts=attempts+1,last_error=null
     where id=current_event.id;
    expanded := expanded+1;
  end loop;
  return expanded;
end
$$;

create or replace function public.claim_notification_push_deliveries(p_limit integer default 3)
returns setof public.notification_push_deliveries
language sql security invoker set search_path = ''
as $$
  with selected as (
    select event_id,subscription_id from public.notification_push_deliveries
    where status in ('pending','failed') and attempts<3
    order by attempts,event_id,subscription_id
    limit least(greatest(coalesce(p_limit,3),1),10)
    for update skip locked
  )
  update public.notification_push_deliveries d
     set status='processing',attempts=d.attempts+1,processing_started_at=now()
    from selected s
   where d.event_id=s.event_id and d.subscription_id=s.subscription_id
  returning d.*
$$;

-- Sem resposta apos timeout/processo interrompido: evitar segundo envio.
create or replace function public.expire_uncertain_push_claims()
returns integer language plpgsql security invoker set search_path = ''
as $$
declare changed integer;
begin
  update public.notification_push_deliveries
     set status='uncertain',last_error='Entrega sem resposta confirmada',
         processing_started_at=null
   where status='processing' and processing_started_at < now()-interval '4 minutes';
  get diagnostics changed=row_count;
  return changed;
end
$$;

revoke all on function public.expand_notification_outbox(integer) from public,anon,authenticated;
revoke all on function public.claim_notification_push_deliveries(integer) from public,anon,authenticated;
revoke all on function public.expire_uncertain_push_claims() from public,anon,authenticated;
grant execute on function public.expand_notification_outbox(integer) to service_role;
grant execute on function public.claim_notification_push_deliveries(integer) to service_role;
grant execute on function public.expire_uncertain_push_claims() to service_role;
