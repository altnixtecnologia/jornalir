-- Etapa 4 — fila privada e idempotente de notificações de assinatura.
-- Preparada em código, NÃO aplicada ao banco. Só enfileira depois de
-- conclusão de uma rodada (ou convite institucional individual).
-- Nunca envia diretamente por trigger SQL.

create table public.contract_signature_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  modality text not null check (modality in ('institutional', 'commercial')),
  channel text not null check (channel in ('email_final', 'telegram_staff')),
  request_id uuid,
  invitation_id uuid,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed','uncertain')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_signature_delivery_referent check (
    (channel = 'email_final' and invitation_id is not null) or
    (channel = 'telegram_staff' and num_nonnulls(request_id, invitation_id) = 1)
  )
);
create unique index contract_signature_delivery_per_invitation
  on public.contract_signature_delivery_outbox (modality, channel, invitation_id)
  where invitation_id is not null;
create unique index contract_signature_delivery_per_request
  on public.contract_signature_delivery_outbox (modality, channel, request_id)
  where request_id is not null and channel = 'telegram_staff';
create index contract_signature_delivery_pending_idx
  on public.contract_signature_delivery_outbox (created_at)
  where status = 'pending';

alter table public.contract_signature_delivery_outbox enable row level security;
revoke all on public.contract_signature_delivery_outbox from public, anon, authenticated;
grant select, insert, update on public.contract_signature_delivery_outbox to service_role;
comment on table public.contract_signature_delivery_outbox is
  'Fila privada de notificações após conclusão de assinaturas. Falhas incertas nunca são reenviadas automaticamente; apenas o servidor acessa.';

create or replace function public.queue_commercial_signature_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.contract_signature_delivery_outbox(modality,channel,request_id,invitation_id)
    select 'commercial','email_final',new.id,i.id
    from public.commercial_signature_invitations i
    join public.commercial_signature_participants p on p.id=i.participant_id
    where i.request_id=new.id and i.status='signed' and p.signer_role<>'contratada'
    on conflict do nothing;
    insert into public.contract_signature_delivery_outbox(modality,channel,request_id)
    values ('commercial','telegram_staff',new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger queue_commercial_signature_completion
  after update of status on public.commercial_signature_requests
  for each row execute function public.queue_commercial_signature_completion();

create or replace function public.queue_institutional_signature_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.contract_signature_delivery_outbox(modality,channel,request_id,invitation_id)
    select 'institutional','email_final',new.id,i.id
    from public.contract_signature_invitations i
    where i.request_id = new.id and i.status='signed'
    on conflict do nothing;
    insert into public.contract_signature_delivery_outbox(modality,channel,request_id)
    values ('institutional','telegram_staff',new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger queue_institutional_signature_completion
  after update of status on public.contract_signature_requests
  for each row execute function public.queue_institutional_signature_completion();

create or replace function public.queue_single_institutional_signature_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.request_id is null and new.status='signed' and old.status is distinct from 'signed' then
    insert into public.contract_signature_delivery_outbox(modality,channel,invitation_id)
    values ('institutional','email_final',new.id) on conflict do nothing;
    insert into public.contract_signature_delivery_outbox(modality,channel,invitation_id)
    values ('institutional','telegram_staff',new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger queue_single_institutional_signature_completion
  after update of status on public.contract_signature_invitations
  for each row execute function public.queue_single_institutional_signature_completion();

create or replace function public.claim_contract_signature_delivery(p_limit integer default 5)
returns setof public.contract_signature_delivery_outbox
language sql security definer set search_path = ''
as $$
  with claimed as (
    select id from public.contract_signature_delivery_outbox
    where status='pending'
    order by created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit,1),1),10)
  )
  update public.contract_signature_delivery_outbox d
  set status='sending',claimed_at=now(),attempts=attempts+1,updated_at=now()
  from claimed where d.id=claimed.id
  returning d.*;
$$;
revoke all on function public.claim_contract_signature_delivery(integer) from public,anon,authenticated;
grant execute on function public.claim_contract_signature_delivery(integer) to service_role;

create or replace function public.finish_contract_signature_delivery(
  p_id uuid,p_status text,p_provider_id text default null,p_error text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.contract_signature_delivery_outbox%rowtype;
begin
  if p_status not in ('sent','failed','uncertain') then raise exception 'Estado de entrega inválido.'; end if;
  select * into v from public.contract_signature_delivery_outbox where id=p_id for update;
  if not found or v.status<>'sending' then raise exception 'Entrega não está em processamento.'; end if;
  if p_status='sent' and nullif(btrim(coalesce(p_provider_id,'')),'') is null then
    raise exception 'Entrega confirmada exige identificador do provedor.';
  end if;
  update public.contract_signature_delivery_outbox
  set status=p_status, provider_message_id=left(p_provider_id,250),
      last_error=case when p_status='sent' then null else left(coalesce(p_error,'Falha sem detalhes'),350) end,
      sent_at=case when p_status='sent' then now() else null end,
      updated_at=now()
  where id=p_id;
  insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
  values (null,'contract_signature_delivery',v.id,'signature_notification_'||p_status,
    jsonb_build_object('modality',v.modality,'channel',v.channel,
    'requestId',v.request_id,'invitationId',v.invitation_id,
    'providerMessageId',case when p_status='sent' then left(p_provider_id,250) else null end));
end;
$$;
revoke all on function public.finish_contract_signature_delivery(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_contract_signature_delivery(uuid,text,text,text) to service_role;

create or replace function public.mark_stale_contract_signature_deliveries()
returns integer language plpgsql security definer set search_path = '' as $$
declare count_changed integer;
begin
  with changed as (
    update public.contract_signature_delivery_outbox
    set status='uncertain',last_error='Timeout sem confirmação: verificar no provedor antes de reenviar.',
        updated_at=now()
    where status='sending' and claimed_at < now()-interval '15 minutes'
    returning id,modality,channel
  ), audit as (
    insert into public.audit_events(user_id,entity_type,entity_id,action,metadata)
    select null,'contract_signature_delivery',id,'signature_notification_uncertain',
           jsonb_build_object('modality',modality,'channel',channel) from changed
    returning id
  )
  select count(*) into count_changed from audit;
  return count_changed;
end;
$$;
revoke all on function public.mark_stale_contract_signature_deliveries() from public,anon,authenticated;
grant execute on function public.mark_stale_contract_signature_deliveries() to service_role;

revoke all on function public.queue_commercial_signature_completion() from public,anon,authenticated;
revoke all on function public.queue_institutional_signature_completion() from public,anon,authenticated;
revoke all on function public.queue_single_institutional_signature_completion() from public,anon,authenticated;
