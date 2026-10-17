-- NOVA em 17/10/2026 (preparação de publicação, reconciliação de
-- histórico). Garante o ESTADO FINAL de public.contract_signature_invitations
-- e public.finalize_contract_signature (v2, 9 parâmetros) — conteúdo que já
-- existe de ponta a ponta no remoto real (confirmado via backup estrutural
-- de 17/10/2026, ANTES desta migration rodar), criado pela execução
-- histórica real (fora de ordem de nome de arquivo) de:
--   20261016233747_contract_signature_invitations.sql
--   20261016233838_finalize_contract_signature.sql (v1, 7 parâmetros —
--     JÁ SUBSTITUÍDA pela v2 no remoto; nunca recriar a v1 aqui, senão
--     ficam as duas versões coexistindo desnecessariamente)
--   20261017003001_signed_pdf_contract_evidence.sql (troca para v2)
--   20261017003427_signature_notification_status.sql
-- Todas as 4 já aplicadas no remoto sob seus nomes exatos (com guarda —
-- ver nota em cada uma), mas timestamp ANTERIOR a
-- 20261017100000_financeiro_contas_a_receber.sql. Esta migration só
-- garante o estado final para um fresh install chegar direto a ele, sem
-- passar pela v1 intermediária (que o remoto real já não tem mais).
-- Idempotente ponta a ponta: IF NOT EXISTS / OR REPLACE / verificação em
-- pg_constraint antes de cada ADD CONSTRAINT.

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
  signed_document_id uuid references public.contract_documents(id) on delete set null,
  signed_sha256 text,
  notification_channel text not null default 'manual' check (notification_channel in ('manual','whatsapp')),
  notification_status text not null default 'not_sent' check (notification_status in ('not_sent','accepted_by_meta','failed')),
  notification_message_id text,
  notification_attempted_at timestamptz,
  notification_error text,
  constraint signature_signed_consistency check (
    status <> 'signed' or
    (signed_at is not null and signature_path is not null
      and original_sha256 is not null and receipt_sha256 is not null
      and consent_version is not null)
  ),
  constraint signature_signed_pdf_consistency check (
    status <> 'signed' or
    (signed_document_id is not null and signed_sha256 ~ '^[a-f0-9]{64}$')
  )
);
create index if not exists idx_contract_signature_contract
  on public.contract_signature_invitations(contract_id,created_at desc);
create index if not exists idx_contract_signature_doc
  on public.contract_signature_invitations(document_id,created_at desc);
alter table public.contract_signature_invitations enable row level security;
revoke all on table public.contract_signature_invitations from public, anon, authenticated;
grant select,insert,update on table public.contract_signature_invitations to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('contract-signatures','contract-signatures',false,1048576,array['image/jpeg'])
on conflict (id) do update set public=false,file_size_limit=1048576,
  allowed_mime_types=array['image/jpeg'];

comment on table public.contract_signature_invitations is
  'Convites privados, token SHA256 de 256 bits, aceite e trilha de evidência eletrônica. Não equivale a assinatura ICP-Brasil.';
comment on column public.contract_signature_invitations.notification_status is
  'accepted_by_meta = API da Meta confirmou o ID; NAO comprova entrega ao cliente.';

-- Garante que a v1 (7 parâmetros) nunca fica coexistindo com a v2 — caso
-- um fresh install chegue até aqui sem nunca ter criado a v1 (fluxo
-- normal: esta migration é a primeira a tocar nesta função), o DROP é
-- apenas defensivo e idempotente (IF EXISTS).
drop function if exists public.finalize_contract_signature(uuid,text,text,text,text,text,jsonb);

create or replace function public.finalize_contract_signature(
  p_invitation_id uuid,
  p_token_hash text,
  p_signature_path text,
  p_receipt_storage_path text,
  p_signed_storage_path text,
  p_original_sha256 text,
  p_receipt_sha256 text,
  p_signed_sha256 text,
  p_audit_metadata jsonb
)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v_inv public.contract_signature_invitations%rowtype;
  v_source public.contract_documents%rowtype;
  v_receipt uuid;
  v_signed uuid;
begin
  select * into v_inv from public.contract_signature_invitations
  where id=p_invitation_id and token_sha256=p_token_hash for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now()
     or v_inv.revoked_at is not null then
    raise exception 'Convite inválido, utilizado, revogado ou expirado';
  end if;
  select * into v_source from public.contract_documents
    where id=v_inv.document_id and contract_id=v_inv.contract_id;
  if not found then raise exception 'Documento original do convite inexistente'; end if;
  if p_original_sha256 !~ '^[a-f0-9]{64}$'
     or p_receipt_sha256 !~ '^[a-f0-9]{64}$'
     or p_signed_sha256 !~ '^[a-f0-9]{64}$'
     or p_signature_path <> 'signatures/' || v_inv.id::text || '.jpg'
     or p_receipt_storage_path <> 'contracts/' || v_inv.contract_id::text || '/signing/' || v_inv.id::text || '.pdf'
     or p_signed_storage_path <> 'contracts/' || v_inv.contract_id::text || '/signing/' || v_inv.id::text || '-signed.pdf' then
    raise exception 'Referências das evidências inválidas';
  end if;

  insert into public.contract_documents(
    contract_id,document_type,name,file_reference,notes,extracted_data
  ) values (
    v_inv.contract_id,v_source.document_type,
    left('Versão assinada - ' || v_source.name,180),
    p_signed_storage_path,
    'Documento com páginas originais e anexo de aceite eletrônico ao final, sem ICP-Brasil.',
    jsonb_build_object('sourceDocumentId',v_source.id,'signatureInvitationId',v_inv.id,
      'sourceSha256',p_original_sha256,'signedSha256',p_signed_sha256)
  ) returning id into v_signed;

  insert into public.contract_documents(
    contract_id,document_type,name,file_reference,notes,extracted_data
  ) values (
    v_inv.contract_id,'authorization',
    left('Comprovante de assinatura - ' || v_inv.signer_name,180),
    p_receipt_storage_path,
    'Registro de aceite eletrônico e SHA-256 do documento original; não é certificado ICP-Brasil.',
    jsonb_build_object('sourceDocumentId',v_source.id,'signatureInvitationId',v_inv.id,
      'sourceSha256',p_original_sha256,'receiptSha256',p_receipt_sha256)
  ) returning id into v_receipt;

  update public.contract_signature_invitations set
    status='signed', signed_at=now(),signature_path=p_signature_path,
    receipt_document_id=v_receipt, signed_document_id=v_signed,
    original_sha256=p_original_sha256, receipt_sha256=p_receipt_sha256,
    signed_sha256=p_signed_sha256, consent_version='contract-v1',
    audit_metadata=coalesce(p_audit_metadata,'{}'::jsonb)
  where id=v_inv.id;
  return v_receipt;
end; $$;

revoke all on function public.finalize_contract_signature(uuid,text,text,text,text,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.finalize_contract_signature(uuid,text,text,text,text,text,text,text,jsonb)
  to service_role;
