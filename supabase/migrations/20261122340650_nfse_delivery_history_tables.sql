-- NFS-e (PARTE A): documentos fiscais privados (somente metadados/SHA-256) e histórico de entrega.
-- Só CRIA objetos novos; NÃO toca em nfse_issued_notes (sem trigger, sem função, sem fila automática).
-- É tudo o que o webhook do Resend precisa. A fila automática (trigger) é a PARTE B, aplicada só quando a emissão for liberada.
-- NAO aplicar no Supabase oficial sem autorização. Requer: public.nfse_issued_notes, public.profiles.
-- Ao aplicar, registrar a versão real do ledger e renomear este arquivo para ela.
-- Reversão (somente com as tabelas vazias): drop table public.nfse_delivery_attempts; drop table public.nfse_document_assets;

set local lock_timeout = '3s';

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
  complained_at timestamptz, -- reclamação (spam) registrada uma única vez pelo webhook
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
-- Um unico email pendente/processando por nota: impede duplo clique
-- concorrente ao reenvio e nao interfere em tentativas anteriores aceitas.
create unique index if not exists nfse_delivery_one_active_email
  on public.nfse_delivery_attempts(issued_note_id)
  where channel='email' and status in ('queued','processing');
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
