-- APENAS CI: esquema mínimo compatível com tabelas de assinaturas existentes.
-- Jamais aplicar em Supabase. PostgreSQL temporário iniciado pelo GitHub Actions.
create role anon;
create role authenticated;
create role service_role;

create table public.profiles (id uuid primary key);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.commercial_signature_requests (
  id uuid primary key, status text not null
);
create table public.commercial_signature_participants (
  id uuid primary key, signer_role text not null, signer_name text not null,
  signer_email text not null
);
create table public.commercial_signature_invitations (
  id uuid primary key,
  request_id uuid not null references public.commercial_signature_requests(id),
  participant_id uuid not null references public.commercial_signature_participants(id),
  status text not null
);
create table public.contract_signature_requests (
  id uuid primary key, status text not null
);
create table public.contract_signature_invitations (
  id uuid primary key,
  request_id uuid references public.contract_signature_requests(id),
  status text not null
);
