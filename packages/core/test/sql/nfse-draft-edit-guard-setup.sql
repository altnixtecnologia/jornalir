-- PostgreSQL descartavel: dados 100% sinteticos (CI), nunca banco oficial.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table public.nfse_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  tomador_kind text, tomador_name text, tomador_cpf text, tomador_cnpj text,
  tomador_municipal_registration text, tomador_state_registration text,
  tomador_zip text, tomador_street text, tomador_number text,
  tomador_complement text, tomador_neighborhood text, tomador_city text,
  tomador_state text, tomador_ibge_code text, tomador_email text,
  tomador_phone text, service_profile_id uuid, c_trib_nac text,
  c_trib_mun text, c_nbs text, issqn_taxation text,
  fiscal_special_tax_regime text, location_municipality text,
  location_ibge_code text, fiscal_c_atv_sn text,
  fiscal_cst_ibs_cbs text, fiscal_c_class_trib text,
  fiscal_c_ind_op text, fiscal_issuer_simples_nacional_option text,
  fiscal_issuer_ibs_cbs_simples_nacional_regime text,
  fiscal_issuer_special_tax_regime_code text, competency_date date,
  service_value numeric(12,2), service_description text, notes text,
  status text not null default 'draft',
  transmission_locked_at timestamptz
);
create table public.nfse_issued_notes (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.nfse_drafts(id)
);
create table public.nfse_transmission_attempts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.nfse_drafts(id),
  status text not null,
  created_at timestamptz not null
);
insert into public.nfse_drafts
  (id, client_id, tomador_kind, tomador_name,
   competency_date, service_value, service_description)
values
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000101',
   'individual', 'TOMADOR DE TESTE', '2026-11-12', 100.00, 'SERVICO FICTICIO'),
  ('00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000102',
   'individual', 'TOMADOR DE TESTE', '2026-11-12', 100.00, 'SERVICO FICTICIO'),
  ('00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000103',
   'individual', 'TOMADOR DE TESTE', '2026-11-12', 100.00, 'SERVICO FICTICIO'),
  ('00000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000104',
   'individual', 'TOMADOR DE TESTE', '2026-11-12', 100.00, 'SERVICO FICTICIO');
