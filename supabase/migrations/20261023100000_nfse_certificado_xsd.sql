-- ==================================================================
-- NFS-e — PARTE 2B: certificado digital A1 real (armazenamento
-- criptografado) + remoção do campo signature_algorithm (a incerteza
-- que o motivou foi resolvida — ver packages/core/src/nfse/signature.ts,
-- NFSE_DPS_SIGNATURE_PROFILE) + remoção do campo issqn_rate do perfil
-- de serviço (ajuste final Parte 2B). NÃO aplicada nesta sessão
-- (Supabase bloqueado, HTTP 402) — só escrita/revisada. Incremental:
-- NUNCA altera 20261022100000_nfse_emissao_nacional.sql.
-- ==================================================================

-- 1) signature_algorithm não é mais uma escolha do usuário — o perfil
-- de assinatura da DPS agora é fixo (confirmado contra fonte oficial
-- do Portal Nacional, ver signature.ts). Coluna removida.
alter table public.nfse_issuer_configs
  drop column if exists signature_algorithm;

-- 2) issqn_rate NUNCA deveria ter sido tratado como propriedade fiscal
-- permanente de um perfil de serviço genérico ("Publicidade", "Produção
-- de vídeo" etc.) — a alíquota de ISSQN depende do município de
-- incidência, do regime tributário do prestador e de regras do Simples
-- Nacional que ainda não foram mapeadas contra o XSD/DPS oficial.
-- Removida sem substituto inventado: NENHUM campo novo, NENHUM default,
-- NENHUMA alíquota hardcoded. Enquanto esse mapeamento não existir, o
-- cálculo de vISSQN na DPS continua indisponível (ver dps-builder.ts) —
-- a transmissão real já está bloqueada por outros motivos mesmo assim.
alter table public.nfse_service_profiles
  drop column if exists issqn_rate;

-- ==================================================================
-- 2) CERTIFICADO DIGITAL A1 (material criptografado) — a senha do
-- PFX NUNCA é persistida (nem em texto, nem em log); só a chave
-- privada/certificado JÁ EXTRAÍDOS do PFX validado são guardados, e a
-- chave privada é sempre criptografada (AES-256-GCM, ver
-- packages/core/src/nfse/secret-store.ts) antes de chegar aqui. A
-- chave mestra de criptografia vive SÓ em variável de ambiente do
-- servidor (NFSE_CERTIFICATE_MASTER_KEY) — nunca neste banco.
-- ==================================================================

create table public.nfse_certificates (
  id uuid primary key default gen_random_uuid(),
  issuer_config_id uuid not null references public.nfse_issuer_configs (id),

  -- Metadata do certificado — informação PÚBLICA, segura de expor à UI.
  subject_cnpj text,
  subject_name text,
  issuer_name text,
  serial_number text not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,

  -- Certificado X.509 é público — guardado em claro (PEM).
  certificate_pem text not null,

  -- Chave privada SEMPRE criptografada (AES-256-GCM) — nunca em texto.
  private_key_ciphertext text not null,
  private_key_iv text not null,
  private_key_auth_tag text not null,

  active boolean not null default true,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.nfse_certificates is
  'Certificado digital A1 validado (PFX/P12) do prestador — a senha NUNCA é persistida; a chave privada é sempre guardada criptografada (AES-256-GCM, chave mestra só em variável de ambiente do servidor, ver secret-store.ts). "active" garante no máximo um certificado ativo por prestador (ver índice único abaixo) — substituir certificado nunca deixa dois ativos ao mesmo tempo, e nunca edita uma linha existente (sempre desativa + insere uma nova).';

comment on column public.nfse_certificates.private_key_ciphertext is
  'Chave privada criptografada (AES-256-GCM) — NUNCA texto puro. Decifrada só em memória, só no momento de assinar (ver certificate-service.ts), nunca cacheada/persistida decifrada.';

-- Nunca mais de um certificado ATIVO por prestador ao mesmo tempo.
create unique index nfse_certificates_one_active_per_issuer
  on public.nfse_certificates (issuer_config_id)
  where active;

create index nfse_certificates_issuer_config_id_idx on public.nfse_certificates (issuer_config_id);

alter table public.nfse_certificates enable row level security;

create policy nfse_certificates_select_admin_owner
  on public.nfse_certificates for select
  to authenticated
  using (public.is_active_admin_or_owner());

create policy nfse_certificates_insert_admin_owner
  on public.nfse_certificates for insert
  to authenticated
  with check (public.is_active_admin_or_owner());

-- UPDATE só pra desativar (active=false) ao substituir certificado —
-- nunca pra editar metadata/material de uma linha existente.
create policy nfse_certificates_update_admin_owner
  on public.nfse_certificates for update
  to authenticated
  using (public.is_active_admin_or_owner())
  with check (public.is_active_admin_or_owner());

-- Sem policy de delete — histórico de certificados (mesmo desativados)
-- nunca é apagado.

create or replace function public.set_nfse_certificate_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger nfse_certificates_set_actor
  before insert on public.nfse_certificates
  for each row
  execute function public.set_nfse_certificate_actor();
