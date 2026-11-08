-- Etapa 3B.2 (08/11/2026): Google opcional como prova COMPLEMENTAR.
-- NÃO aplicada à produção nesta etapa. OTP por e-mail permanece obrigatório.
-- Registro privado vinculado ao convite exato (jamais autorização por Google
-- isoladamente). O Google sub identifica a conta, NÃO comprova CPF.

create table public.contract_signature_google_evidence (
  id uuid primary key default gen_random_uuid(),
  institutional_invitation_id uuid references public.contract_signature_invitations(id) on delete restrict,
  commercial_invitation_id uuid references public.commercial_signature_invitations(id) on delete restrict,
  provider text not null default 'google' check (provider = 'google'),
  provider_subject text not null check (char_length(provider_subject) between 5 and 255),
  verified_email text not null check (char_length(verified_email) between 3 and 254),
  google_auth_user_id uuid not null,
  verified_at timestamptz not null default now(),
  constraint contract_google_one_invitation check (
    num_nonnulls(institutional_invitation_id, commercial_invitation_id) = 1
  ),
  unique(institutional_invitation_id),
  unique(commercial_invitation_id)
);
comment on table public.contract_signature_google_evidence is
  'Uso opcional de Google OAuth no convite do signatário. Evidência suplementar privada; não substitui OTP, aceite expresso, assinatura e hash.';
create index contract_google_identity_idx on public.contract_signature_google_evidence(google_auth_user_id);

alter table public.contract_signature_google_evidence enable row level security;
revoke all on public.contract_signature_google_evidence from public, anon, authenticated;
grant select, insert on public.contract_signature_google_evidence to service_role;
-- Sem policy para anon/authenticated: apenas Server Actions verificadas usam
-- a service role e nunca expõem sub ou e-mail em respostas públicas.

create or replace function public.reject_contract_google_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Evidência de autenticação Google é imutável.' using errcode = '42501';
end;
$$;

create trigger contract_google_evidence_immutable
  before update or delete on public.contract_signature_google_evidence
  for each row execute function public.reject_contract_google_evidence_mutation();

revoke all on function public.reject_contract_google_evidence_mutation() from public, anon, authenticated;
