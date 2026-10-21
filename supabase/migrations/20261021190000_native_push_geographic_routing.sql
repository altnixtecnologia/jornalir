
-- Jornal IR | Entrega geográfica de notificações Android.
-- DEPENDE de 20261021180000_localities_state_code_for_geotargeting.
-- Aplicação controlada; não altera configurações/consentimento de dispositivos existentes.

alter table public.native_push_devices
  add column if not exists geo_mode text not null default 'all',
  add column if not exists geo_city_ids uuid[] not null default '{}'::uuid[];

alter table public.native_push_devices
  add constraint native_push_geo_mode_check
  check (geo_mode in ('all','selected')) not valid;
alter table public.native_push_devices
  add constraint native_push_geo_city_count_check
  check (cardinality(geo_city_ids) <= 100 and
    (geo_mode='all' or cardinality(geo_city_ids)>0)) not valid;

alter table public.notification_events
  add column if not exists geo_scope text not null default 'general',
  add column if not exists geo_state_code text,
  add column if not exists geo_locality_id uuid references public.localities(id);

alter table public.notification_events
  add constraint notification_events_geo_scope_check
  check (geo_scope in ('city','state','region','country','general')) not valid;
create index if not exists native_push_devices_geo_city_idx
  on public.native_push_devices using gin (geo_city_ids)
  where enabled;

-- Snapshot de abrangência no momento da publicação. Trigger de publicação
-- existente é reaproveitada: exatamente 1 evento por matéria, sem push em
-- salvar edições posteriores e sem push quando não estiver habilitado.
create or replace function public.queue_article_push_on_publish()
returns trigger language plpgsql security definer set search_path = public
as $body$
declare
  v_enabled boolean;
  v_mode text;
  v_kind text;
  v_key text;
  v_scope text;
  v_uf text;
begin
  if new.status <> 'published' or (tg_op='UPDATE' and old.status='published') then
    return new;
  end if;
  v_mode := coalesce(new.notification_mode,'none');
  if v_mode not in ('normal','urgent') or new.slug is null or new.slug='' then
    return new;
  end if;

  select article_publish_events_enabled into v_enabled
  from public.site_notification_feature_flags limit 1;
  if not coalesce(v_enabled,false) then
    insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
    values(null,'articles',new.id,'notification_skipped',
      jsonb_build_object('title',left(new.title,140),'notificationMode',v_mode,
        'reason','article_publish_events_enabled=false',
        'origin','trigger:queue_article_push_on_publish'));
    return new;
  end if;

  -- Abrangência inválida/banco incompleto: NÃO enviar a todos por engano.
  select scope,state_code into v_scope,v_uf from public.localities
  where id=new.locality_id and active;
  if v_scope is null or (v_scope in ('city','state') and v_uf is null) then
    insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
    values(null,'articles',new.id,'notification_skipped',
      jsonb_build_object('reason','locality_missing_or_state_code_invalid',
        'origin','trigger:queue_article_push_on_publish'));
    return new;
  end if;

  v_kind := case when v_mode='urgent' then 'urgent' else 'ordinary' end;
  v_key := 'article-publish:' || new.id::text;
  insert into public.notification_events
    (app_kind,kind,title,body,href,scheduled_at,dedupe_key,
     geo_scope,geo_state_code,geo_locality_id)
  values ('site',v_kind,left(new.title,140),left(coalesce(new.subtitle,''),280),
    '/noticias/' || new.slug,now(),v_key,v_scope,v_uf,new.locality_id)
  on conflict(dedupe_key) do nothing;

  insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
  values(null,'articles',new.id,'notification_dispatched',
    jsonb_build_object('title',left(new.title,140),'kind',v_kind,
      'href','/noticias/'||new.slug,'scope',v_scope,'stateCode',v_uf,
      'origin','trigger:queue_article_push_on_publish'));
  return new;
end;
$body$;

-- Formar entregas APENAS para aparelhos elegíveis (antes do FCM).
-- Campos de snapshot impedem mudanças retroativas de público ao editar
-- uma abrangência já usada por evento que está na fila.
create or replace function public.claim_native_push_deliveries(p_limit integer default 20)
returns table(delivery_id uuid,event_id uuid,device_id uuid)
language plpgsql security invoker set search_path=''
as $body$
begin
  insert into public.native_push_deliveries(event_id,device_id)
  select e.id,d.id
  from public.notification_events e
  join public.native_push_devices d
    on d.enabled and d.platform='android'
   and d.consented_at<=e.scheduled_at
   and d.last_seen_at >= now()-interval '60 days'
   and ((e.kind='ordinary' and d.ordinary_enabled)
     or (e.kind='urgent' and d.urgent_enabled))
   and (
     d.geo_mode='all'
     or e.geo_scope in ('general','country','region')
     or (e.geo_scope='city' and e.geo_locality_id=any(d.geo_city_ids))
     or (e.geo_scope='state' and exists (
       select 1 from public.localities selected
       where selected.id=any(d.geo_city_ids)
         and selected.scope='city'
         and selected.state_code=e.geo_state_code
     ))
   )
  where e.app_kind='site'
    and e.kind in ('ordinary','urgent')
    and e.target_profile_id is null
    and e.scheduled_at between now()-interval '24 hours' and now()
  order by e.scheduled_at desc
  limit 3000
  on conflict do nothing;

  return query
  with eligible as (
    select n.id from public.native_push_deliveries n
    where n.status='pending'
    order by n.created_at,n.id
    for update skip locked
    limit least(greatest(p_limit,1),50)
  )
  update public.native_push_deliveries d
  set status='sending',attempted_at=now()
  from eligible
  where d.id=eligible.id
  returning d.id,d.event_id,d.device_id;
end;
$body$;
revoke all on function public.claim_native_push_deliveries(integer)
  from public,anon,authenticated;
grant execute on function public.claim_native_push_deliveries(integer) to service_role;

-- Pós-migração e depois de verificar dados existentes:
-- alter table public.native_push_devices validate constraint native_push_geo_mode_check;
-- alter table public.native_push_devices validate constraint native_push_geo_city_count_check;
-- alter table public.notification_events validate constraint notification_events_geo_scope_check;
