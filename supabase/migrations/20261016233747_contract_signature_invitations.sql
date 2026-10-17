-- GUARDA adicionada em 17/10/2026 (reconciliação de histórico): este
-- arquivo já está aplicado no remoto sob este nome exato e depende de
-- public.institutional_contracts/contract_documents, criadas em
-- 20261017100000_financeiro_contas_a_receber.sql, POSTERIOR a este
-- arquivo. Criação real para fresh install consolidada em
-- 20261017100005_contract_signature_family.sql (nova, depois dessa
-- dependência).
do $$
begin
  if to_regclass('public.institutional_contracts') is not null
     and to_regclass('public.contract_documents') is not null
  then
    execute $sql$
      create table if not exists public.contract_signature_invitations (
        id uuid primary key default gen_random_uuid(),
        contract_id uuid not null references public.institutional_contracts(id) on delete restrict,
        document_id uuid not null references public.contract_documents(id) on delete restrict,
        signer_name text not null check (length(btrim(signer_name)) between 3 and 180),
        signer_email text not null check (length(btrim(signer_email)) between 5 and 254),
        signer_phone text,
        token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
        status text not null default 'pending' check (status in ('pending','signed','revoked','expired')),
        expires_at timestamptz not null,
        created_by uuid references public.profiles(id) on delete set null,
        created_at timestamptz not null default now(),
        signed_at timestamptz,
        revoked_at timestamptz,
        signature_path text,
        receipt_document_id uuid references public.contract_documents(id) on delete set null,
        original_sha256 text check (original_sha256 is null or original_sha256 ~ '^[0-9a-f]{64}$'),
        receipt_sha256 text check (receipt_sha256 is null or receipt_sha256 ~ '^[0-9a-f]{64}$'),
        consent_version text,
        audit_metadata jsonb not null default '{}'::jsonb,
        constraint signature_signed_consistency check (
          status <> 'signed' or
          (signed_at is not null and signature_path is not null
            and original_sha256 is not null and receipt_sha256 is not null
            and consent_version is not null)
        )
      )
    $sql$;
    execute 'create index if not exists idx_contract_signature_contract on public.contract_signature_invitations(contract_id,created_at desc)';
    execute 'create index if not exists idx_contract_signature_doc on public.contract_signature_invitations(document_id,created_at desc)';
    execute 'alter table public.contract_signature_invitations enable row level security';
    execute 'revoke all on table public.contract_signature_invitations from public, anon, authenticated';
    execute 'grant select,insert,update on table public.contract_signature_invitations to service_role';

    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values ('contract-signatures','contract-signatures',false,1048576,array['image/jpeg'])
    on conflict (id) do update set public=false,file_size_limit=1048576,
      allowed_mime_types=array['image/jpeg'];

    comment on table public.contract_signature_invitations is
      'Convites privados, token SHA256 de 256 bits, aceite e trilha de evidência eletrônica. Não equivale a assinatura ICP-Brasil.';
  end if;
end $$;
