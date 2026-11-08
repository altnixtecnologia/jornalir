-- CI, banco PostgreSQL 17 DESCARTÁVEL. Não aplicar no Supabase real.
-- Tabelas mínimas existentes antes das migrations de Google e layout.
create role anon;
create role authenticated;
create role service_role;

create table public.contract_signature_invitations (id uuid primary key);
create table public.commercial_signature_invitations (id uuid primary key);

create table public.contract_templates (
  id uuid primary key,
  document_mode text not null check (document_mode in ('text','fixed_pdf')),
  active boolean not null default false,
  legal_approved_at timestamptz
);
create table public.contract_signature_field_layouts (
  template_id uuid primary key references public.contract_templates(id),
  fields jsonb not null default '[]'::jsonb
);
