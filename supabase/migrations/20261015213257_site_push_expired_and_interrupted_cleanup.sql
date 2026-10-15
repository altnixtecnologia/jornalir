-- Cargas antigas/execuções interrompidas não podem permanecer pendentes para sempre.
-- Uma entrega reservada e sem confirmação é considerada incerta e NÃO é
-- reenviada automaticamente (evita disparar a mesma urgente duas vezes).
create or replace function public.claim_site_push_deliveries(p_limit integer default 20)
returns table(delivery_id uuid,event_id uuid,subscription_id uuid)
language plpgsql security definer set search_path=''
as $$
begin
  update public.site_push_deliveries d
    set status='expired', last_error='Prazo de envio encerrado'
  from public.notification_events e
  where e.id=d.event_id and e.app_kind='site'
    and d.status='pending'
    and (
      (e.kind='urgent' and e.scheduled_at < now()-interval '1 hour')
      or (e.kind='ordinary' and e.scheduled_at < now()-interval '24 hours')
    );

  update public.site_push_deliveries d
    set status='failed', last_error='Envio interrompido ou resultado incerto; não reenviar automaticamente'
  where d.status='sending' and d.attempted_at < now()-interval '5 minutes';

  return query
  with picked as (
    select d.id
    from public.site_push_deliveries d
    join public.notification_events e on e.id=d.event_id
    where d.status='pending'
      and e.app_kind='site'
      and e.scheduled_at<=now()
      and (
        (e.kind='urgent' and e.scheduled_at>=now()-interval '1 hour')
        or (e.kind='ordinary' and e.scheduled_at>=now()-interval '24 hours')
      )
    order by (e.kind='urgent') desc,e.scheduled_at asc,d.attempted_at asc
    for update of d skip locked
    limit least(greatest(p_limit,1),100)
  )
  update public.site_push_deliveries d
  set status='sending',attempted_at=now()
  from picked
  where d.id=picked.id
  returning d.id,d.event_id,d.subscription_id;
end $$;
revoke all on function public.claim_site_push_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_site_push_deliveries(integer) to service_role;