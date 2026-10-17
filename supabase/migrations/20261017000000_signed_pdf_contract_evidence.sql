-- Versao consolidada do PDF, sem substituir o original e seu comprovante.
alter table public.contract_signature_invitations
  add column if not exists signed_document_id uuid references public.contract_documents(id) on delete set null,
  add column if not exists signed_sha256 text;

alter table public.contract_signature_invitations
  add constraint signature_signed_pdf_consistency check (
    status <> 'signed' or
    (signed_document_id is not null and signed_sha256 ~ '^[a-f0-9]{64}$')
  );

drop function if exists public.finalize_contract_signature(uuid,text,text,text,text,text,jsonb);

create function public.finalize_contract_signature(
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
