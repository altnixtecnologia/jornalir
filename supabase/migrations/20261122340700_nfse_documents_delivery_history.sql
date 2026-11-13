-- NFS-e: arquivos fiscais privados + historico de entrega.
-- NAO aplicar no Supabase oficial antes da revisao/autorizacao.
-- A NFS-e autorizada permanece imutavel; entrega jamais muda seu estado fiscal.
create schema if not exists nfse_internal;
revoke all on schema nfse_internal from public, anon, authenticated;

create table if not exists public.nfse_document_assets (
  id uuid primary key default gen_random_uuid(),
  issued_note_id uuid not null references public.nfse_issued_notes(id) on delete restrict,
  kind text not null check (kind in ('nfse_xml','dps_xml','danfse_pdf','cancellation_xml','cancellation_response_xml')),
  r2_key text not null unique,
  sha256 char(64) not null check (sha256 ~ '^[a-f0-9]{64}$'),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  stored_at timestamptz not null default now(),
  unique (issued_note_id, kind)
);
create index if not exists nfse_document_assets_note_idx on public.nfse_document_assets(issued_note_id);
alter table public.nfse_document_assets enable row level security;
revoke all on public.nfse_document_assets from public, anon, authenticated;
grant select, insert on public.nfse_document_assets to service_role;
-- Imutavel: nenhuma policy UPDATE/DELETE (nem para autenticados).
comment on table public.nfse_document_assets is
  'Somente metadados e SHA256 de XML/PDF em bucket PRIVADO R2, nunca URL publica. Historico fiscal original imutavel.';

create table if not exists public.nfse_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  issued_note_id uuid not null references public.nfse_issued_notes(id) on delete restrict,
  channel text not null check (channel in ('email','whatsapp')),
  origin text not null check (origin in ('automatic','manual')),
  status text not null check (status in (
    'queued','processing','accepted','delivered','bounced','failed','uncertain',
    'missing_recipient','opened','operator_confirmed'
  )),
  recipient_snapshot text,
  provider text,
  provider_message_id text,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  processing_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  opened_at timestamptz,
  confirmed_at timestamptz,
  response_summary text,
  updated_at timestamptz not null default now(),
  constraint nfse_delivery_channel_status check (
    (channel='email' and status in (
      'queued','processing','accepted','delivered','bounced','failed','uncertain','missing_recipient'
    )) or
    (channel='whatsapp' and status in ('opened','operator_confirmed'))
  )
);
create unique index if not exists nfse_delivery_automatic_unique
  on public.nfse_delivery_attempts(issued_note_id,channel)
  where origin='automatic';
create unique index if not exists nfse_delivery_provider_unique
  on public.nfse_delivery_attempts(provider,provider_message_id)
  where provider_message_id is not null;
create index if not exists nfse_delivery_note_history
  on public.nfse_delivery_attempts(issued_note_id,requested_at desc,id desc);
create index if not exists nfse_delivery_queue
  on public.nfse_delivery_attempts(status,requested_at)
  where channel='email' and status='queued';
alter table public.nfse_delivery_attempts enable row level security;
revoke all on public.nfse_delivery_attempts from public, anon, authenticated;
grant select, insert, update on public.nfse_delivery_attempts to service_role;
comment on table public.nfse_delivery_attempts is
  'Cada tentativa e preservada por ID. Status do provedor nao equivale a entrega; WhatsApp aberto nao comprova envio.';

-- O enfileiramento fiscal NAO depende do e-mail responder nem do R2.
-- O trigger captura o e-mail fiscal no momento da autorizacao da nota,
-- com fallback ao principal. Se falhar, jamais reverte a nota autorizada.
create or replace function nfse_internal.enqueue_automatic_note_delivery()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_email text;
begin
  if new.environment <> 'production' then return new; end if;
  select coalesce(nullif(btrim(fiscal_email),''),nullif(btrim(email),''))
    into v_email from public.clients where id=new.client_id;
  insert into public.nfse_delivery_attempts
    (issued_note_id,channel,origin,status,recipient_snapshot)
  values (new.id,'email','automatic',
    case when v_email is null then 'missing_recipient' else 'queued' end,
    v_email)
  on conflict do nothing;
  return new;
exception when others then
  -- A emissao foi autorizada externamente: nao destruir o registro fiscal.
  raise warning 'Falha ao enfileirar entrega da NFS-e (SQLSTATE %)', SQLSTATE;
  return new;
end;
$$;
revoke all on function nfse_internal.enqueue_automatic_note_delivery()
  from public, anon, authenticated;
drop trigger if exists nfse_queue_delivery_on_authorization on public.nfse_issued_notes;
create trigger nfse_queue_delivery_on_authorization
after insert on public.nfse_issued_notes
for each row execute function nfse_internal.enqueue_automatic_note_delivery();

-- Com worker de reconciliacao: notas antigas que nao tiverem fila
-- podem ser re-enfileiradas de forma idempotente (nunca enviar dentro
-- do trigger; R2, SMTP e PDF sao processados fora da transacao).
