-- Fixture LOCAL e sintetica para validar a migration de rotacao A1
-- em Postgres descartavel do GitHub Actions. Nada toca Supabase remoto.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists auth;

create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable
as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

create table public.nfse_issuer_configs (
  id uuid primary key,
  cnpj text not null
);
create table public.nfse_certificates (
  id uuid primary key default gen_random_uuid(),
  issuer_config_id uuid not null references public.nfse_issuer_configs(id),
  subject_cnpj text,
  subject_name text,
  issuer_name text,
  serial_number text not null,
  fingerprint text not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  certificate_pem text not null,
  private_key_ciphertext text not null,
  private_key_iv text not null,
  private_key_auth_tag text not null,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index nfse_certificates_one_active_per_issuer
  on public.nfse_certificates(issuer_config_id) where active;

-- Trigger legado reproduzido para a migration poder substitui-lo.
create function public.set_nfse_certificate_actor()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;
create trigger nfse_certificates_set_actor before insert
  on public.nfse_certificates for each row
  execute function public.set_nfse_certificate_actor();

insert into public.nfse_issuer_configs(id, cnpj)
values ('00000000-0000-0000-0000-000000000001', '00000000000000');

insert into public.nfse_certificates (
  id, issuer_config_id, subject_cnpj, serial_number, fingerprint,
  valid_from, valid_until, certificate_pem,
  private_key_ciphertext, private_key_iv, private_key_auth_tag, active
) values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '00000000000000', 'OLD-SYNTHETIC', 'OLD-FINGERPRINT',
  '2020-01-01T00:00:00Z', '2035-01-01T00:00:00Z',
  'SYNTHETIC-PEM-OLD', 'ENCRYPTED-FAKE-OLD', 'IV-OLD', 'TAG-OLD', true
);
