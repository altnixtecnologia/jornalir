-- Item 5, Lote 2, Tarefa 1: múltiplos signatários por contrato.
-- NÃO aplicada ainda (regra de trabalho vigente: desenvolver agora,
-- aplicar depois). Preserva 100% o fluxo individual existente: toda
-- linha de contract_signature_invitations criada ANTES desta migration
-- (ou criada depois sem passar por uma "rodada") tem request_id NULL e
-- continua se comportando exatamente como hoje (base sempre o PDF
-- original, sem bloqueio/fila).
--
-- MODELO: uma "rodada de assinatura" (contract_signature_requests)
-- agrupa N convites (contract_signature_invitations.request_id) para
-- o MESMO documento. Cada convite continua tendo seu próprio estado
-- (pending/signed/revoked/expired) — isso já "registra separadamente
-- o estado de cada assinatura" e permite "identificar quem assinou e
-- quem está pendente" com uma simples consulta por request_id.
--
-- CONSOLIDAÇÃO CORRETA (não é só "o último PDF gerado"): cada vez que
-- alguém assina dentro de uma rodada, o PDF assinado é construído a
-- partir do PDF assinado do signatário anterior da MESMA rodada (não
-- do original de novo) — ver claim_signature_turn abaixo, que devolve
-- o caminho de armazenamento correto pra basear a próxima assinatura.
-- Assim a folha de evidência de cada signatário se acumula sobre as
-- anteriores, e quando o ÚLTIMO signatário pendente assina, o PDF dele
-- já contém TODAS as folhas de evidência — esse é o documento final
-- consolidado (contract_signature_requests.final_document_id).
--
-- CONCORRÊNCIA: a geração do PDF acontece em Node (fora de uma única
-- transação SQL), então duas assinaturas concorrentes da MESMA rodada
-- não podem simplesmente usar "for update" ao redor de todo o processo.
-- Em vez disso, um mutex curto e com expiração automática
-- (locked_by/locked_at, 2 minutos) é reivindicado por
-- claim_signature_turn ANTES de construir o PDF (transação curta) e
-- liberado por finalize_contract_signature ao concluir (ou por
-- release_signature_turn se o processo falhar entre as duas chamadas)
-- — nunca fica travado permanentemente mesmo se o signatário fechar a
-- aba no meio do processo.

create table if not exists public.contract_signature_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.institutional_contracts(id) on delete restrict,
  document_id uuid not null references public.contract_documents(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  final_document_id uuid references public.contract_documents(id) on delete set null,
  locked_by uuid,
  locked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint signature_request_completed_consistency check (
    status <> 'completed' or final_document_id is not null
  )
);
create index if not exists idx_contract_signature_requests_contract
  on public.contract_signature_requests(contract_id, created_at desc);
alter table public.contract_signature_requests enable row level security;
revoke all on table public.contract_signature_requests from public, anon, authenticated;
grant select, insert, update on table public.contract_signature_requests to service_role;

comment on table public.contract_signature_requests is
  'Agrupa N convites de assinatura (contract_signature_invitations.request_id) do MESMO documento em uma rodada com múltiplos signatários. status=completed só quando TODOS os convites não revogados/não expirados da rodada estiverem signed; final_document_id é o PDF que acumula a evidência de todos eles.';
comment on column public.contract_signature_requests.locked_by is
  'Mutex curto: id do convite que está, agora, construindo/enviando seu PDF assinado nesta rodada. Nunca persiste além de locked_at + 2 minutos (ver claim_signature_turn) — nunca trava a rodada permanentemente.';

alter table public.contract_signature_invitations
  add column if not exists request_id uuid references public.contract_signature_requests(id) on delete set null;
create index if not exists idx_contract_signature_request
  on public.contract_signature_invitations(request_id) where request_id is not null;

comment on column public.contract_signature_invitations.request_id is
  'NULL = convite individual legado/avulso (comportamento 100% preservado: base sempre o PDF original). Preenchido = parte de uma rodada com múltiplos signatários (contract_signature_requests) — a base da assinatura passa a ser o PDF assinado do signatário anterior da mesma rodada, quando existir.';

-- Reivindica o "turno" de construção do PDF desta assinatura e devolve
-- de onde ela deve partir: o PDF assinado mais recente da MESMA rodada
-- (se já houver algum signatário anterior) ou o documento original.
-- SECURITY INVOKER (mesmo padrão de finalize_contract_signature) — só
-- service_role executa, nunca anon/authenticated.
create or replace function public.claim_signature_turn(
  p_invitation_id uuid,
  p_token_hash text
)
returns table (base_storage_path text, base_document_name text, contract_number text)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_inv public.contract_signature_invitations%rowtype;
  v_req public.contract_signature_requests%rowtype;
  v_prev_path text;
  v_prev_name text;
  v_doc_path text;
  v_doc_name text;
  v_contract_number text;
begin
  select * into v_inv from public.contract_signature_invitations
    where id = p_invitation_id and token_sha256 = p_token_hash for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now()
     or v_inv.revoked_at is not null then
    raise exception 'Convite inválido, utilizado, revogado ou expirado';
  end if;

  if v_inv.request_id is not null then
    select * into v_req from public.contract_signature_requests
      where id = v_inv.request_id for update;
    if not found or v_req.status <> 'pending' then
      raise exception 'Esta rodada de assinatura já foi concluída ou cancelada';
    end if;
    if v_req.locked_by is not null and v_req.locked_by <> p_invitation_id
       and v_req.locked_at > now() - interval '2 minutes' then
      raise exception 'Outro signatário desta mesma rodada está concluindo a assinatura agora. Tente novamente em instantes.';
    end if;
    update public.contract_signature_requests
      set locked_by = p_invitation_id, locked_at = now()
      where id = v_req.id;

    select cd.file_reference, cd.name into v_prev_path, v_prev_name
      from public.contract_signature_invitations si
      join public.contract_documents cd on cd.id = si.signed_document_id
      where si.request_id = v_inv.request_id and si.status = 'signed'
      order by si.signed_at desc limit 1;
  end if;

  if v_prev_path is null then
    select cd.file_reference, cd.name into v_doc_path, v_doc_name
      from public.contract_documents cd
      where cd.id = v_inv.document_id and cd.contract_id = v_inv.contract_id;
    if not found then raise exception 'Documento original do convite inexistente'; end if;
  end if;

  select ic.contract_number into v_contract_number
    from public.institutional_contracts ic where ic.id = v_inv.contract_id;

  return query select coalesce(v_prev_path, v_doc_path), coalesce(v_prev_name, v_doc_name),
    coalesce(v_contract_number, 'Sem número');
end;
$$;

revoke all on function public.claim_signature_turn(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_signature_turn(uuid, text) to service_role;

comment on function public.claim_signature_turn(uuid, text) is
  'Passo 1 da assinatura (antes de construir o PDF em Node): valida o convite, reivindica o mutex curto da rodada (se houver) e devolve de onde a próxima assinatura deve partir (PDF do signatário anterior da rodada, ou o original). Nunca marca nada como assinado — isso é feito só por finalize_contract_signature.';

-- Libera o mutex da rodada se o processo falhar ENTRE claim_signature_turn
-- e finalize_contract_signature (ex.: erro ao construir/enviar o PDF) —
-- sem isso, o próximo signatário teria que esperar os 2 minutos de
-- expiração automática do lock.
create or replace function public.release_signature_turn(p_invitation_id uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  update public.contract_signature_requests
    set locked_by = null, locked_at = null
    where locked_by = p_invitation_id;
end;
$$;

revoke all on function public.release_signature_turn(uuid) from public, anon, authenticated;
grant execute on function public.release_signature_turn(uuid) to service_role;

comment on function public.release_signature_turn(uuid) is
  'Libera o mutex curto da rodada sem concluir a assinatura — chamado pelo servidor quando a construção/upload do PDF falha depois do claim_signature_turn.';

-- finalize_contract_signature ganha a verificação de conclusão da
-- rodada: quando o convite que está sendo finalizado é o ÚLTIMO
-- pendente (não revogado, não expirado) da rodada, marca a rodada
-- como completed e aponta final_document_id pro PDF deste convite
-- (que, por construção via claim_signature_turn, já acumula a
-- evidência de todos os signatários anteriores). Sempre libera o
-- mutex da rodada ao final, com sucesso ou não.
drop function if exists public.finalize_contract_signature(uuid,text,text,text,text,text,text,text,jsonb);

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
  v_remaining int;
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

  if v_inv.request_id is not null then
    select count(*) into v_remaining from public.contract_signature_invitations
      where request_id = v_inv.request_id and id <> v_inv.id
        and status = 'pending' and expires_at > now() and revoked_at is null;
    if v_remaining = 0 then
      update public.contract_signature_requests
        set status='completed', final_document_id=v_signed, completed_at=now(),
            locked_by=null, locked_at=null
        where id = v_inv.request_id;
    else
      update public.contract_signature_requests
        set locked_by=null, locked_at=null
        where id = v_inv.request_id;
    end if;
  end if;

  return v_receipt;
end; $$;

revoke all on function public.finalize_contract_signature(uuid,text,text,text,text,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.finalize_contract_signature(uuid,text,text,text,text,text,text,text,jsonb)
  to service_role;
