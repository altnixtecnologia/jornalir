-- Staged only. Apply after reviewing existing pending migrations and testing on a branch.
-- Documents remain associated with the Jornal IR master client.
-- No anon/client DML; server-side service credentials only after admin authorization.
create table if not exists public.client_contract_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  source_kind text not null check (source_kind in ('subscription','commercial_sale','site_interest')),
  source_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  template_version text not null,
  title text not null,
  document_number text,
  status text not null default 'draft' check (status in ('draft','ready','awaiting_signature','partially_signed','signed','declined','expired','cancelled')),
  original_storage_key text,
  original_sha256 text check (original_sha256 is null or original_sha256 ~ '^[a-f0-9]{64}$'),
  signed_storage_key text,
  signed_sha256 text check (signed_sha256 is null or signed_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_storage_key text,
  evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[a-f0-9]{64}$'),
  signer_count integer not null default 1 check (signer_count between 1 and 5),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  signed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint client_contract_document_source_revision unique(source_kind,source_id,revision),
  constraint client_contract_signed_requires_files check (
    status <> 'signed' or
    (signed_storage_key is not null and signed_sha256 is not null and evidence_storage_key is not null and evidence_sha256 is not null and signed_at is not null)
  )
);
create index if not exists idx_client_contract_documents_client on public.client_contract_documents(client_id,created_at desc);
create index if not exists idx_client_contract_documents_status on public.client_contract_documents(status,created_at desc);
create table if not exists public.client_contract_signers (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.client_contract_documents(id) on delete restrict,
  sequence_number smallint not null check(sequence_number between 1 and 5),
  full_name text not null,
  email text,
  phone text,
  masked_document text,
  role text not null check(role in ('customer','company_representative','publisher_representative','witness')),
  status text not null default 'pending' check(status in ('pending','invited','verified','signed','declined','expired','revoked')),
  token_hash text unique check(token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
  token_expires_at timestamptz,
  token_revoked_at timestamptz,
  access_attempts integer not null default 0 check(access_attempts >= 0),
  verified_at timestamptz,
  verification_method text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(document_id, sequence_number)
);
create index if not exists idx_contract_signers_doc on public.client_contract_signers(document_id);
create table if not exists public.client_contract_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.client_contract_documents(id) on delete restrict,
  signer_id uuid references public.client_contract_signers(id) on delete restrict,
  event_type text not null,
  event_id text unique,
  actor_kind text not null check(actor_kind in ('staff','signer','system')),
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_client_contract_events_doc on public.client_contract_events(document_id,created_at);
create table if not exists public.client_contract_deliveries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.client_contract_documents(id) on delete restrict,
  signer_id uuid references public.client_contract_signers(id) on delete restrict,
  channel text not null check(channel in ('email','whatsapp_manual','whatsapp_api')),
  purpose text not null check(purpose in ('invitation','completed_copy')),
  destination_masked text not null,
  provider_message_id text,
  status text not null default 'pending' check(status in ('pending','sent','failed','cancelled')),
  error_code text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_client_contract_deliveries_doc on public.client_contract_deliveries(document_id,created_at desc);

alter table public.client_contract_documents enable row level security;
alter table public.client_contract_signers enable row level security;
alter table public.client_contract_events enable row level security;
alter table public.client_contract_deliveries enable row level security;
revoke all on public.client_contract_documents,public.client_contract_signers,public.client_contract_events,public.client_contract_deliveries from public,anon,authenticated;
grant select on public.client_contract_documents,public.client_contract_signers,public.client_contract_events,public.client_contract_deliveries to authenticated;
drop policy if exists client_contract_documents_admin_read on public.client_contract_documents;
create policy client_contract_documents_admin_read on public.client_contract_documents
  for select to authenticated using ((select public.is_active_admin_or_owner()));
drop policy if exists client_contract_signers_admin_read on public.client_contract_signers;
create policy client_contract_signers_admin_read on public.client_contract_signers
  for select to authenticated using ((select public.is_active_admin_or_owner()));
drop policy if exists client_contract_events_admin_read on public.client_contract_events;
create policy client_contract_events_admin_read on public.client_contract_events
  for select to authenticated using ((select public.is_active_admin_or_owner()));
drop policy if exists client_contract_deliveries_admin_read on public.client_contract_deliveries;
create policy client_contract_deliveries_admin_read on public.client_contract_deliveries
  for select to authenticated using ((select public.is_active_admin_or_owner()));

-- Protect all signed versions, even when a privileged actor tries to edit them.
create or replace function public.prevent_signed_contract_document_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'signed' and new is distinct from old then
    raise exception 'Signed contract versions are immutable. Create a new revision.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_client_contract_document_immutable on public.client_contract_documents;
create trigger trg_client_contract_document_immutable before update on public.client_contract_documents
for each row execute function public.prevent_signed_contract_document_update();
revoke execute on function public.prevent_signed_contract_document_update() from public,anon,authenticated;
-- Event rows must be append-only (even on mistakes; use compensating events).
create or replace function public.prevent_contract_event_change()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Contract evidence is append-only'; end;
$$;
drop trigger if exists trg_contract_events_append_only on public.client_contract_events;
create trigger trg_contract_events_append_only before update or delete on public.client_contract_events
for each row execute function public.prevent_contract_event_change();
revoke execute on function public.prevent_contract_event_change() from public,anon,authenticated;
