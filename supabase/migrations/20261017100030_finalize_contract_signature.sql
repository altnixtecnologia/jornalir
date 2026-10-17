-- RENOMEADA em 17/10/2026 (de 20261016235700 para 20261017100030,
-- preparação de publicação): mesma razão das migrations de assinatura de
-- contrato vizinhas — reposicionada para depois de contract_documents/
-- contract_signature_invitations existirem. create or replace function é
-- idempotente; nunca aplicada a nenhum banco real sob o nome antigo.
--
-- Commit de assinatura e comprovante em uma transação, invocado apenas
-- pelo servidor com service_role. Não aceita identidade/timestamp do cliente.
create or replace function public.finalize_contract_signature(
  p_invitation_id uuid,
  p_token_hash text,
  p_signature_path text,
  p_receipt_storage_path text,
  p_original_sha256 text,
  p_receipt_sha256 text,
  p_audit_metadata jsonb
)
returns uuid language plpgsql set search_path = ''
as $$
declare
  v_inv public.contract_signature_invitations%rowtype;
  v_document_id uuid;
begin
  select * into v_inv from public.contract_signature_invitations
    where id=p_invitation_id and token_sha256=p_token_hash for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now()
     or v_inv.revoked_at is not null then
    raise exception 'Convite inválido, já usado, revogado ou expirado';
  end if;
  if p_original_sha256 !~ '^[0-9a-f]{64}$' or p_receipt_sha256 !~ '^[0-9a-f]{64}$'
     or p_signature_path <> ('signatures/' || v_inv.id::text || '.jpg')
     or p_receipt_storage_path <> ('contracts/' || v_inv.contract_id::text || '/signing/' || v_inv.id::text || '.pdf') then
    raise exception 'Referência de evidência inválida';
  end if;

  insert into public.contract_documents(contract_id,document_type,name,file_reference,notes,extracted_data)
  values(v_inv.contract_id,'authorization',
    left('Comprovante de assinatura - ' || v_inv.signer_name,180),
    p_receipt_storage_path,
    'Aceite eletrônico com comprovante e hash SHA-256 do documento original.',
    jsonb_build_object('signatureInvitationId',v_inv.id,
      'originalSha256',p_original_sha256,'receiptSha256',p_receipt_sha256))
  returning id into v_document_id;

  update public.contract_signature_invitations
  set status='signed',signed_at=now(),signature_path=p_signature_path,
      receipt_document_id=v_document_id,original_sha256=p_original_sha256,
      receipt_sha256=p_receipt_sha256,consent_version='contract-v1',
      audit_metadata=coalesce(p_audit_metadata,'{}'::jsonb)
  where id=v_inv.id;
  return v_document_id;
end; $$;
revoke all on function public.finalize_contract_signature(uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_contract_signature(uuid,text,text,text,text,text,jsonb) to service_role;
