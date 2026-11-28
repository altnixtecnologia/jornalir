-- Notificações ao cliente por WhatsApp: registro durável de despacho, eventos de entrega do provedor
-- e processamento atômico. Preparada localmente, NÃO aplicada. Depende de
-- 20261127150000_receivables_report_exclusion.sql (título de teste classificado fica fora).
--
-- Reaproveita o que existe: billing_notification_dispatches (confirmação de pagamento, mantida),
-- billing_message_logs (auditoria manual) e a rotina diária já agendada (altnix-service-finance).
-- Nada aqui envia mensagem, cria cobrança, altera título, recibo ou autorização operacional.
-- Jornal IR opera um único tenant; a chave de idempotência usa o cliente (destinatário).

-- 1. Registro de despacho ---------------------------------------------------------------------
create table public.customer_notification_dispatches (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'new_obligation','due_soon','overdue','receipt_available','service_suspended','service_restored',
    'manual_billing','manual_confirmation','manual_receipt')),
  entity_type text not null check (entity_type in ('receivable','receipt','service_outbox')),
  entity_id uuid not null,
  -- Ocorrência do evento de negócio (ex.: 'created', 'due_soon:3', 'overdue:1', 'manual:2026-11-27').
  occurrence text not null check (char_length(occurrence) between 1 and 80),
  client_id uuid not null references public.clients (id),
  origin text not null check (origin in ('automatic','manual')),
  batch_id uuid,
  requested_by uuid references public.profiles (id),
  template_name text not null check (char_length(template_name) between 1 and 120),
  to_phone text,
  params jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in (
    'pending','processing','accepted','delivered','read','failed','uncertain','skipped')),
  status_reason text check (status_reason is null or char_length(status_reason) <= 200),
  attempts integer not null default 0 check (attempts between 0 and 10),
  max_attempts integer not null default 3 check (max_attempts between 1 and 6),
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claimed_at timestamptz,
  -- Gravado ANTES da chamada ao provedor: separa "interrompido antes" (seguro reenfileirar) de
  -- "interrompido depois" (incerto, nunca reenviar às cegas).
  call_started_at timestamptz,
  provider_message_id text,
  error_code text,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  accepted_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customer_notification_dispatches is
  'Despacho durável de WhatsApp ao cliente. Uma linha por evento de negócio + destinatário. accepted = aceito pela API do provedor; delivered/read só por callback autêntico do provedor.';

create unique index customer_notification_dispatches_event_once
  on public.customer_notification_dispatches (event_type, entity_id, occurrence, client_id);
create unique index customer_notification_dispatches_provider_message_unique
  on public.customer_notification_dispatches (provider_message_id) where provider_message_id is not null;
create index customer_notification_dispatches_queue_idx
  on public.customer_notification_dispatches (origin, status, next_attempt_at) where status in ('pending','processing');
create index customer_notification_dispatches_batch_idx
  on public.customer_notification_dispatches (batch_id) where batch_id is not null;

create trigger customer_notification_dispatches_set_updated_at
  before update on public.customer_notification_dispatches
  for each row execute function public.set_updated_at();

alter table public.customer_notification_dispatches enable row level security;
revoke all on public.customer_notification_dispatches from public, anon, authenticated;
grant select on public.customer_notification_dispatches to authenticated;
grant select, insert, update on public.customer_notification_dispatches to service_role;
create policy customer_notification_dispatches_select_staff
  on public.customer_notification_dispatches for select to authenticated
  using (public.is_active_staff());

-- 2. Eventos de entrega do provedor (append-only, idempotente) ------------------------------------
create table public.whatsapp_delivery_events (
  id bigint generated always as identity primary key,
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 200),
  status text not null check (status in ('sent','delivered','read','failed')),
  provider_timestamp timestamptz not null,
  error_code text,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  received_at timestamptz not null default now(),
  unique (provider_message_id, status, provider_timestamp)
);
create index whatsapp_delivery_events_message_idx on public.whatsapp_delivery_events (provider_message_id);
alter table public.whatsapp_delivery_events enable row level security;
revoke all on public.whatsapp_delivery_events from public, anon, authenticated;
grant select on public.whatsapp_delivery_events to authenticated;
grant select, insert on public.whatsapp_delivery_events to service_role;
create policy whatsapp_delivery_events_select_staff
  on public.whatsapp_delivery_events for select to authenticated using (public.is_active_staff());

-- 3. Enfileirar em lote (idempotente) ---------------------------------------------------------
create function public.customer_notification_enqueue(p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $enqueue$
declare inserted integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then return 0; end if;
  with src as (
    select * from jsonb_to_recordset(p_rows) as x(
      event_type text, entity_type text, entity_id uuid, occurrence text, client_id uuid, origin text,
      batch_id uuid, requested_by uuid, template_name text, to_phone text, params jsonb,
      status text, status_reason text)
  ), ins as (
    insert into public.customer_notification_dispatches(
      event_type, entity_type, entity_id, occurrence, client_id, origin, batch_id, requested_by,
      template_name, to_phone, params, status, status_reason)
    select event_type, entity_type, entity_id, occurrence, client_id, origin, batch_id, requested_by,
      template_name, to_phone, coalesce(params, '[]'::jsonb),
      case when status = 'skipped' then 'skipped' else 'pending' end, status_reason
    from src
    on conflict (event_type, entity_id, occurrence, client_id) do nothing
    returning 1
  ) select count(*) into inserted from ins;
  return inserted;
end;$enqueue$;
revoke all on function public.customer_notification_enqueue(jsonb) from public, anon, authenticated;
grant execute on function public.customer_notification_enqueue(jsonb) to service_role;

-- 4. Reivindicação atômica + recuperação de processamento interrompido ------------------------------
create function public.customer_notification_claim(p_origin text, p_limit integer, p_batch uuid default null)
returns table(id uuid, claim_token uuid, template_name text, to_phone text, params jsonb, event_type text, entity_id uuid, attempts integer)
language plpgsql security invoker set search_path = '' as $claim$
#variable_conflict use_column
begin
  if p_origin not in ('automatic','manual') or p_limit is null or p_limit not between 1 and 100 then return; end if;
  -- Processamento abandonado (> 15 min): sem chamada ao provedor volta à fila; com chamada iniciada
  -- vira "uncertain" (o provedor pode ter aceitado) e nunca é reenviado automaticamente.
  update public.customer_notification_dispatches d set
    status = case when d.call_started_at is null then 'pending' else 'uncertain' end,
    status_reason = case when d.call_started_at is null then 'recuperado_apos_interrupcao' else 'interrompido_apos_chamada_ao_provedor' end,
    claim_token = null, claimed_at = null
  where d.origin = p_origin and d.status = 'processing' and d.claimed_at < statement_timestamp() - interval '15 minutes'
    and (p_batch is null or d.batch_id = p_batch);
  return query
  with picked as (
    select c.id from public.customer_notification_dispatches c
    where c.origin = p_origin and c.status = 'pending' and c.next_attempt_at <= statement_timestamp()
      and (p_batch is null or c.batch_id = p_batch)
    order by c.next_attempt_at, c.created_at
    limit p_limit for update skip locked
  )
  update public.customer_notification_dispatches d set
    status = 'processing', claim_token = gen_random_uuid(), claimed_at = statement_timestamp(),
    call_started_at = null, attempts = d.attempts + 1
  from picked where d.id = picked.id
  returning d.id, d.claim_token, d.template_name, d.to_phone, d.params, d.event_type, d.entity_id, d.attempts;
end;$claim$;
revoke all on function public.customer_notification_claim(text, integer, uuid) from public, anon, authenticated;
grant execute on function public.customer_notification_claim(text, integer, uuid) to service_role;

create function public.customer_notification_mark_call_started(p_id uuid, p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $mark$
declare affected integer;
begin
  update public.customer_notification_dispatches set call_started_at = statement_timestamp()
  where id = p_id and claim_token = p_token and status = 'processing' and call_started_at is null;
  get diagnostics affected = row_count;
  return affected = 1;
end;$mark$;
revoke all on function public.customer_notification_mark_call_started(uuid, uuid) from public, anon, authenticated;
grant execute on function public.customer_notification_mark_call_started(uuid, uuid) to service_role;

-- 5. Resultado do envio: aceito / repetível (limitado) / definitivo / incerto / ignorado ---------------------
create function public.customer_notification_finish(
  p_id uuid, p_token uuid, p_outcome text, p_provider_message_id text, p_error_code text, p_error_message text)
returns text language plpgsql security invoker set search_path = '' as $finish$
declare d public.customer_notification_dispatches%rowtype; new_status text;
begin
  if p_outcome not in ('accepted','retryable','failed','uncertain','skipped') then return null; end if;
  select * into d from public.customer_notification_dispatches where id = p_id and claim_token = p_token and status = 'processing' for update;
  if not found then return null; end if;
  new_status := case p_outcome
    when 'accepted' then 'accepted'
    when 'uncertain' then 'uncertain'
    when 'skipped' then 'skipped'
    when 'failed' then 'failed'
    else case when d.attempts < d.max_attempts then 'pending' else 'failed' end end;
  update public.customer_notification_dispatches set
    status = new_status, claim_token = null, claimed_at = null,
    provider_message_id = case when p_outcome = 'accepted' then p_provider_message_id else provider_message_id end,
    accepted_at = case when p_outcome = 'accepted' then statement_timestamp() else accepted_at end,
    failed_at = case when new_status = 'failed' then statement_timestamp() else failed_at end,
    -- backoff limitado: 10 min x tentativa
    next_attempt_at = case when new_status = 'pending' then statement_timestamp() + (interval '10 minutes' * d.attempts) else next_attempt_at end,
    error_code = left(p_error_code, 60), error_message = left(p_error_message, 500),
    status_reason = case when p_outcome = 'retryable' and new_status = 'failed' then 'tentativas_esgotadas' else status_reason end
  where id = p_id;
  return new_status;
end;$finish$;
revoke all on function public.customer_notification_finish(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.customer_notification_finish(uuid, uuid, text, text, text, text) to service_role;

-- Reenvio MANUAL limitado: só falha definitiva (ou incerta com confirmação explícita), no máximo 6 tentativas.
create function public.customer_notification_requeue(p_id uuid, p_actor uuid, p_confirm_uncertain boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $requeue$
declare affected integer;
begin
  update public.customer_notification_dispatches set
    status = 'pending', status_reason = 'reenvio_manual', requested_by = coalesce(p_actor, requested_by),
    max_attempts = least(attempts + 1, 6), next_attempt_at = statement_timestamp(), error_code = null, error_message = null
  where id = p_id and attempts < 6 and (status = 'failed' or (status = 'uncertain' and p_confirm_uncertain));
  get diagnostics affected = row_count;
  return affected = 1;
end;$requeue$;
revoke all on function public.customer_notification_requeue(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.customer_notification_requeue(uuid, uuid, boolean) to service_role;

-- 6. Callback de entrega: idempotente, tolerante a duplicado e fora de ordem ------------------------------
create function public.whatsapp_apply_delivery_event(
  p_message_id text, p_status text, p_at timestamptz, p_error_code text, p_error text)
returns text language plpgsql security invoker set search_path = '' as $delivery$
declare d public.customer_notification_dispatches%rowtype; inserted integer; target text;
begin
  if p_status not in ('sent','delivered','read','failed') or p_message_id is null or p_at is null then return 'ignored'; end if;
  insert into public.whatsapp_delivery_events(provider_message_id, status, provider_timestamp, error_code, error_message)
  values (p_message_id, p_status, p_at, left(p_error_code, 60), left(p_error, 500))
  on conflict (provider_message_id, status, provider_timestamp) do nothing;
  get diagnostics inserted = row_count;
  select * into d from public.customer_notification_dispatches where provider_message_id = p_message_id for update;
  if not found then return case when inserted = 1 then 'unmatched' else 'duplicate' end; end if;
  -- Ordem: accepted < delivered < read. "failed" só vale se ainda não houve entrega/leitura.
  if p_status = 'read' then
    update public.customer_notification_dispatches set status = 'read', read_at = coalesce(read_at, p_at),
      delivered_at = coalesce(delivered_at, p_at), accepted_at = coalesce(accepted_at, p_at) where id = d.id and status <> 'read';
  elsif p_status = 'delivered' then
    update public.customer_notification_dispatches set status = 'delivered', delivered_at = coalesce(delivered_at, p_at),
      accepted_at = coalesce(accepted_at, p_at) where id = d.id and status in ('processing','accepted','uncertain','failed');
  elsif p_status = 'sent' then
    update public.customer_notification_dispatches set status = 'accepted', accepted_at = coalesce(accepted_at, p_at)
      where id = d.id and status in ('processing','uncertain');
  else
    update public.customer_notification_dispatches set status = 'failed', failed_at = p_at, error_code = left(p_error_code, 60),
      error_message = left(p_error, 500) where id = d.id and status in ('processing','accepted','uncertain');
  end if;
  return case when inserted = 1 then 'applied' else 'duplicate' end;
end;$delivery$;
revoke all on function public.whatsapp_apply_delivery_event(text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_apply_delivery_event(text, text, timestamptz, text, text) to service_role;

-- 7. Candidatos financeiros em lote (uma consulta por ciclo) ---------------------------------------------
-- Escopo inicial: clientes com exportação digital habilitada (os clientes integrados ao Informativo) e
-- títulos de publicidade vinculados a venda comercial. Título de teste classificado nunca é candidato.
create function public.customer_notification_finance_candidates(
  p_since date, p_today date, p_due_soon_days integer, p_overdue_offsets integer[], p_limit integer)
returns table(event_type text, entity_type text, entity_id uuid, occurrence text, client_id uuid,
  client_name text, whatsapp text, reference text, amount numeric, due_date date, event_date date)
language plpgsql stable security invoker set search_path = '' as $cand$
#variable_conflict use_column
begin
  if p_since is null or p_today is null or p_limit is null or p_limit not between 1 and 1000 then return; end if;
  return query
  with eligible as (
    select v.id, v.client_id, v.status, v.balance, v.original_amount, v.due_date, v.created_at,
           coalesce(nullif(v.description, ''), v.internal_reference) as ref
    from public.receivables_with_balance v
    join public.receivables r on r.id = v.id
    where r.report_excluded_at is null
      and v.source_type = 'advertising' and v.commercial_sale_id is not null
      and exists (select 1 from public.client_digital_export_permissions e where e.client_id = v.client_id and e.enabled)
  ), who as (
    select c.id, c.whatsapp,
      coalesce(case when c.kind = 'individual' then c.full_name else coalesce(c.trade_name, c.company_name) end, 'Cliente') as name
    from public.clients c where c.status = 'active'
  )
  select * from (
    select 'new_obligation'::text as event_type, 'receivable'::text as entity_type, e.id as entity_id, 'created'::text as occurrence, e.client_id as client_id, w.name as client_name, w.whatsapp as whatsapp, e.ref as reference,
           e.balance as amount, e.due_date as due_date, e.created_at::date as event_date
    from eligible e join who w on w.id = e.client_id
    where e.status in ('open','partially_paid') and e.balance > 0 and e.created_at::date >= p_since
      and not exists (select 1 from public.customer_notification_dispatches d where d.event_type = 'new_obligation' and d.entity_id = e.id and d.occurrence = 'created' and d.client_id = e.client_id)
    union all
    select 'due_soon', 'receivable', e.id, 'due_soon:' || p_due_soon_days, e.client_id, w.name, w.whatsapp, e.ref,
           e.balance, e.due_date, e.due_date
    from eligible e join who w on w.id = e.client_id
    where p_due_soon_days between 1 and 15 and e.status in ('open','partially_paid') and e.balance > 0
      and e.due_date = p_today + p_due_soon_days and e.due_date >= p_since
      and not exists (select 1 from public.customer_notification_dispatches d where d.event_type = 'due_soon' and d.entity_id = e.id and d.occurrence = 'due_soon:' || p_due_soon_days and d.client_id = e.client_id)
    union all
    select 'overdue', 'receivable', e.id, 'overdue:' || o.off, e.client_id, w.name, w.whatsapp, e.ref,
           e.balance, e.due_date, e.due_date
    from eligible e join who w on w.id = e.client_id
    cross join lateral unnest(coalesce(p_overdue_offsets, '{}'::integer[])) as o(off)
    where o.off between 1 and 60 and e.status in ('open','partially_paid') and e.balance > 0
      and e.due_date = p_today - o.off and e.due_date >= p_since
      and not exists (select 1 from public.customer_notification_dispatches d where d.event_type = 'overdue' and d.entity_id = e.id and d.occurrence = 'overdue:' || o.off and d.client_id = e.client_id)
    union all
    select 'receipt_available', 'receipt', rr.id, 'receipt', e.client_id, w.name, w.whatsapp, e.ref,
           rr.amount, e.due_date, rr.received_at::date
    from public.receivable_receipts rr
    join eligible e on e.id = rr.receivable_id
    join who w on w.id = e.client_id
    where rr.reversed_at is null and rr.received_at::date >= p_since
      and not exists (select 1 from public.customer_notification_dispatches d where d.event_type = 'receipt_available' and d.entity_id = rr.id and d.occurrence = 'receipt' and d.client_id = e.client_id)
  ) q
  limit p_limit;
end;$cand$;
revoke all on function public.customer_notification_finance_candidates(date, date, integer, integer[], integer) from public, anon, authenticated;
grant execute on function public.customer_notification_finance_candidates(date, date, integer, integer[], integer) to service_role;

-- 8. Candidatos de suspensão/restabelecimento: só estado EFETIVO (confirmado pelo Informativo) -----------------
create function public.customer_notification_service_candidates(p_since timestamptz, p_limit integer)
returns table(event_type text, entity_type text, entity_id uuid, occurrence text, client_id uuid,
  client_name text, whatsapp text, event_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $svc$
#variable_conflict use_column
begin
  if p_since is null or p_limit is null or p_limit not between 1 and 500 then return; end if;
  return query
  select case when o.payload->>'status' = 'suspended' then 'service_suspended' else 'service_restored' end,
         'service_outbox'::text, o.event_id, 'effective'::text, b.client_id,
         coalesce(case when c.kind = 'individual' then c.full_name else coalesce(c.trade_name, c.company_name) end, 'Cliente'),
         c.whatsapp, o.delivered_at
  from altnix_operational.service_outbox o
  join altnix_operational.service_binding b on b.service_id = o.service_id and b.enabled
  join public.clients c on c.id = b.client_id and c.status = 'active'
  where o.delivered_at is not null and o.delivered_at >= p_since and o.decision_origin = 'finance'
    -- ainda é o estado vigente (uma revisão posterior torna o aviso obsoleto)
    and o.revision = (select max(t.revision) from altnix_operational.service_outbox t where t.service_id = o.service_id)
    and not exists (select 1 from public.customer_notification_dispatches d where d.entity_id = o.event_id and d.occurrence = 'effective' and d.client_id = b.client_id and d.event_type in ('service_suspended','service_restored'))
    and (o.payload->>'status' = 'suspended'
         or (o.payload->>'status' = 'authorized' and exists (
              select 1 from altnix_operational.service_outbox p
              where p.service_id = o.service_id and p.revision = o.revision - 1 and p.payload->>'status' = 'suspended')))
  order by o.delivered_at
  limit p_limit;
end;$svc$;
revoke all on function public.customer_notification_service_candidates(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.customer_notification_service_candidates(timestamptz, integer) to service_role;

-- 9. Lote de avisos de assinatura: "sending" e "uncertain" -------------------------------------------------
-- Antes, reivindicar o lote já o marcava como "sent": uma interrupção deixava a impressão de lote concluído.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.subscription_due_reminder_batches'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%status%draft%' loop
    execute format('alter table public.subscription_due_reminder_batches drop constraint %I', c.conname);
  end loop;
  alter table public.subscription_due_reminder_batches add column if not exists claimed_at timestamptz;
  alter table public.subscription_due_reminder_batches
    add constraint subscription_due_reminder_batches_status_v2 check (status in ('draft','sending','sent')),
    add constraint subscription_due_reminder_batches_state_v2 check (
      (status = 'draft' and sent_at is null and sent_by is null and claimed_at is null)
      or (status = 'sending' and sent_by is not null and sent_at is null and claimed_at is not null)
      or (status = 'sent' and sent_at is not null and sent_by is not null));

  for c in select conname from pg_constraint
           where conrelid = 'public.subscription_due_reminder_recipients'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%status%pending%' loop
    execute format('alter table public.subscription_due_reminder_recipients drop constraint %I', c.conname);
  end loop;
  alter table public.subscription_due_reminder_recipients
    add constraint subscription_due_reminder_recipients_status_v2
    check (status in ('pending','sending','sent','failed','skipped','uncertain'));
end $$;
