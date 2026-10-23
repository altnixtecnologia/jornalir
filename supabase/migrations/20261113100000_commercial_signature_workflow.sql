-- Assinatura comercial separada do assinador institucional.
-- Envio por WhatsApp/email permanece MANUAL: criar convites não envia mensagens.
create table public.commercial_signature_requests (
 id uuid primary key default gen_random_uuid(),
 preparation_id uuid not null unique references public.commercial_signature_preparations(id) on delete restrict,
 status text not null default 'pending' check (status in ('pending','completed','cancelled')),
 final_file_reference text, final_sha256 text check (final_sha256 ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 locked_by uuid,
 locked_at timestamptz,
 check ((status='completed' and final_file_reference is not null and final_sha256 is not null and completed_at is not null)
     or (status<>'completed' and final_file_reference is null and final_sha256 is null and completed_at is null))
);
create table public.commercial_signature_invitations (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.commercial_signature_requests(id) on delete restrict,
 participant_id uuid not null references public.commercial_signature_participants(id) on delete restrict,
 previous_invitation_id uuid references public.commercial_signature_invitations(id) on delete restrict,
 token_sha256 text not null unique check(token_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','signed','revoked')),
 expires_at timestamptz not null,
 verified_at timestamptz,
 verified_user_id uuid,
 signed_at timestamptz,
 consent_version text,
 signed_path text,
 signed_sha256 text check(signed_sha256 ~ '^[a-f0-9]{64}$'),
 receipt_path text,
 receipt_sha256 text check(receipt_sha256 ~ '^[a-f0-9]{64}$'),
 signature_path text,
 audit_metadata jsonb,
 created_at timestamptz not null default now(),
 check((status='signed' and signed_at is not null and signed_path is not null
        and signed_sha256 is not null and receipt_path is not null and receipt_sha256 is not null
        and signature_path is not null and consent_version='commercial-v1')
   or (status<>'signed' and signed_at is null and signed_path is null and receipt_path is null))
);
create unique index commercial_signature_pending_once
 on public.commercial_signature_invitations(request_id,participant_id) where status='pending';
create index commercial_signature_invites_request_idx
 on public.commercial_signature_invitations(request_id,created_at);
alter table public.commercial_signature_requests enable row level security;
alter table public.commercial_signature_invitations enable row level security;
revoke all on public.commercial_signature_requests from public,anon,authenticated;
revoke all on public.commercial_signature_invitations from public,anon,authenticated;
grant select on public.commercial_signature_requests to authenticated;
grant select on public.commercial_signature_invitations to authenticated;
create policy commercial_signature_requests_staff on public.commercial_signature_requests
 for select to authenticated using(public.staff_can_module_action('publicidade','contratos_revisar')
  or public.staff_can_see_module('financeiro'));
create policy commercial_signature_invitations_staff on public.commercial_signature_invitations
 for select to authenticated using(public.staff_can_module_action('publicidade','contratos_revisar')
  or public.staff_can_see_module('financeiro'));

create or replace function public.create_commercial_signature_request(
 p_preparation_id uuid,p_invites jsonb
) returns uuid language plpgsql security definer set search_path='' as $func$
declare
 v_prep record; v_request uuid; v_participant record;
 v_hash text; v_count integer:=0; v_row jsonb;
begin
 if auth.uid() is null or not public.staff_can_module_action('publicidade','contratos_revisar') then
   raise exception 'Ação restrita a revisor comercial.' using errcode='42501';
 end if;
 select p.id,p.document_id,p.status,d.package_id into v_prep
 from public.commercial_signature_preparations p
 join public.commercial_contract_documents d on d.id=p.document_id
 where p.id=p_preparation_id for update of p;
 if not found or v_prep.status<>'draft' then
   raise exception 'Preparação não está vigente.' using errcode='23514';
 end if;
 if not exists(select 1 from public.commercial_contract_packages
               where id=v_prep.package_id and status='legal_approved') then
   raise exception 'Revisão jurídica indisponível.' using errcode='23514';
 end if;
 if exists(select 1 from public.commercial_signature_requests
           where preparation_id=p_preparation_id) then
   raise exception 'Esta lista já possui rodada de assinaturas.' using errcode='23505';
 end if;
 select count(*) into v_count from public.commercial_signature_participants
  where preparation_id=p_preparation_id;
 if v_count not between 2 and 10
    or jsonb_typeof(p_invites) is distinct from 'array'
    or jsonb_array_length(p_invites)<>v_count then
   raise exception 'Forneça um token por participante.' using errcode='23514';
 end if;
 insert into public.commercial_signature_requests(preparation_id,created_by)
 values(p_preparation_id,auth.uid()) returning id into v_request;
 for v_participant in
   select id,signing_order from public.commercial_signature_participants
   where preparation_id=p_preparation_id order by signing_order
 loop
   select value into v_row from jsonb_array_elements(p_invites)
    where (value->>'participant_id')::text = v_participant.id::text;
   if not found then raise exception 'Falta token do participante.' using errcode='23514'; end if;
   v_hash:=lower(v_row->>'token_sha256');
   if v_hash is null or v_hash !~ '^[a-f0-9]{64}$' then
     raise exception 'Token inválido.' using errcode='23514';
   end if;
   insert into public.commercial_signature_invitations(
     request_id,participant_id,token_sha256,expires_at
   ) values(v_request,v_participant.id,v_hash,now()+interval '7 days');
 end loop;
 return v_request;
end;
$func$;
revoke all on function public.create_commercial_signature_request(uuid,jsonb) from public,anon;
grant execute on function public.create_commercial_signature_request(uuid,jsonb) to authenticated;

-- A marcação de OTP e o fechamento são exclusivos do servidor com service_role.
-- O cliente não atualiza diretamente estado, hash, consentimento ou documentos.
create or replace function public.verify_commercial_signer_email(
 p_token_sha256 text,p_auth_user_id uuid
) returns void language plpgsql security definer set search_path='' as $func$
declare v_inv record;v_email text;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'Somente serviço.' using errcode='42501';
 end if;
 select i.id,p.signer_email into v_inv from public.commercial_signature_invitations i
 join public.commercial_signature_participants p on p.id=i.participant_id
 join public.commercial_signature_requests r on r.id=i.request_id
 where i.token_sha256=p_token_sha256 and i.status='pending' and i.expires_at>now()
 and r.status='pending' for update of i;
 if not found then raise exception 'Convite indisponível.' using errcode='23514'; end if;
 select lower(email) into v_email from auth.users
  where id=p_auth_user_id and email_confirmed_at is not null;
 if v_email is distinct from lower(v_inv.signer_email) then
   raise exception 'E-mail confirmado não corresponde ao convite.' using errcode='42501';
 end if;
 update public.commercial_signature_invitations
 set verified_at=now(),verified_user_id=p_auth_user_id where id=v_inv.id;
end;
$func$;
revoke all on function public.verify_commercial_signer_email(text,uuid) from public,anon,authenticated;
grant execute on function public.verify_commercial_signer_email(text,uuid) to service_role;

-- Uma assinatura por vez; versão final agrega as páginas de todas as anteriores.
create or replace function public.claim_commercial_signature_turn(
 p_token_sha256 text,p_auth_user_id uuid
) returns table(invitation_id uuid,request_id uuid,source_path text,source_sha256 text,document_title text)
 language plpgsql security definer set search_path='' as $func$
declare v record; v_preceding integer;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'Somente serviço.' using errcode='42501';
 end if;
 select i.id as iid,i.request_id,i.verified_at,i.verified_user_id,
   i.expires_at,i.status,r.status as request_status,r.locked_by,r.locked_at,
   p.signing_order,p.signer_email,d.file_reference,d.sha256,d.title
 into v from public.commercial_signature_invitations i
 join public.commercial_signature_participants p on p.id=i.participant_id
 join public.commercial_signature_requests r on r.id=i.request_id
 join public.commercial_signature_preparations sp on sp.id=r.preparation_id
 join public.commercial_contract_documents d on d.id=sp.document_id
 where i.token_sha256=p_token_sha256 for update of i,r;
 if not found or v.status<>'pending' or v.request_status<>'pending'
  or v.expires_at<=now() or v.verified_user_id is distinct from p_auth_user_id
  or v.verified_at is null or v.verified_at<now()-interval '20 minutes' then
   raise exception 'Convite sem confirmação recente do e-mail.' using errcode='42501';
 end if;
 if v.locked_by is not null
  and v.locked_at>now()-interval '5 minutes' then
   raise exception 'Outra assinatura está sendo concluída.' using errcode='55P03';
 end if;
 select count(*) into v_preceding from public.commercial_signature_participants p
 join public.commercial_signature_preparations prep on prep.id=p.preparation_id
 join public.commercial_signature_requests req on req.preparation_id=prep.id
 where req.id=v.request_id and p.signing_order<v.signing_order
 and not exists (
   select 1 from public.commercial_signature_invitations done
   where done.request_id=v.request_id and done.participant_id=p.id
   and done.status='signed'
 );
 if v_preceding<>0 then
   raise exception 'Aguarde os signatários anteriores nesta rodada.' using errcode='23514';
 end if;
 update public.commercial_signature_requests
  set locked_by=v.iid,locked_at=now() where id=v.request_id;
 return query
 select v.iid,v.request_id,
  coalesce((select previous.signed_path
    from public.commercial_signature_invitations previous
    join public.commercial_signature_participants p on p.id=previous.participant_id
    where previous.request_id=v.request_id and previous.status='signed'
    order by p.signing_order desc limit 1),v.file_reference),
  coalesce((select previous.signed_sha256
    from public.commercial_signature_invitations previous
    join public.commercial_signature_participants p on p.id=previous.participant_id
    where previous.request_id=v.request_id and previous.status='signed'
    order by p.signing_order desc limit 1),v.sha256),v.title;
end;
$func$;
revoke all on function public.claim_commercial_signature_turn(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_commercial_signature_turn(text,uuid) to service_role;

create or replace function public.release_commercial_signature_turn(p_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $func$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Somente serviço.' using errcode='42501'; end if;
 update public.commercial_signature_requests set locked_by=null,locked_at=null
 where locked_by=p_invitation_id;
end;
$func$;
revoke all on function public.release_commercial_signature_turn(uuid) from public,anon,authenticated;
grant execute on function public.release_commercial_signature_turn(uuid) to service_role;

create or replace function public.finalize_commercial_signature(
 p_token_sha256 text,p_auth_user_id uuid,p_original_sha256 text,
 p_signature_sha256 text,p_receipt_sha256 text,p_signed_sha256 text,p_audit jsonb
) returns boolean language plpgsql security definer set search_path='' as $func$
declare v record;v_remaining integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Somente serviço.' using errcode='42501'; end if;
 select i.id as iid,i.request_id,i.verified_user_id,i.verified_at,
   i.expires_at,i.status,r.status as request_status,r.locked_by,r.locked_at
 into v from public.commercial_signature_invitations i
 join public.commercial_signature_requests r on r.id=i.request_id
 where i.token_sha256=p_token_sha256 for update of i,r;
 if not found or v.status<>'pending' or v.expires_at<=now()
    or v.request_status<>'pending' or v.locked_by is distinct from v.iid
    or v.locked_at<now()-interval '5 minutes'
    or v.verified_user_id is distinct from p_auth_user_id
    or v.verified_at<now()-interval '20 minutes' then
   raise exception 'Tentativa de conclusão inválida.' using errcode='42501';
 end if;
 if p_original_sha256 !~ '^[a-f0-9]{64}$'
 or p_signature_sha256 !~ '^[a-f0-9]{64}$'
 or p_receipt_sha256 !~ '^[a-f0-9]{64}$'
 or p_signed_sha256 !~ '^[a-f0-9]{64}$' then
   raise exception 'Hashes de evidência inválidos.' using errcode='23514';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='contract-signatures'
               and name='commercial/'||v.iid::text||'.jpg')
    or not exists(select 1 from storage.objects where bucket_id='contract-documents'
               and name='commercial-signatures/'||v.request_id::text||'/'||v.iid::text||'-receipt.pdf')
    or not exists(select 1 from storage.objects where bucket_id='contract-documents'
               and name='commercial-signatures/'||v.request_id::text||'/'||v.iid::text||'-signed.pdf') then
    raise exception 'Evidências de assinatura não armazenadas.' using errcode='23514';
 end if;
 update public.commercial_signature_invitations set
  status='signed',signed_at=now(),consent_version='commercial-v1',
  signature_path='commercial/'||v.iid::text||'.jpg',
  receipt_path='commercial-signatures/'||v.request_id::text||'/'||v.iid::text||'-receipt.pdf',
  signed_path='commercial-signatures/'||v.request_id::text||'/'||v.iid::text||'-signed.pdf',
  receipt_sha256=p_receipt_sha256,signed_sha256=p_signed_sha256,
  audit_metadata=coalesce(p_audit,'{}'::jsonb)||jsonb_build_object(
    'originalSha256',p_original_sha256,'signatureSha256',p_signature_sha256)
 where id=v.iid;
 select count(*) into v_remaining from public.commercial_signature_invitations
 where request_id=v.request_id and status='pending';
 if v_remaining=0 then
  update public.commercial_signature_requests set
   status='completed',completed_at=now(),
   final_file_reference='commercial-signatures/'||v.request_id::text||'/'||v.iid::text||'-signed.pdf',
   final_sha256=p_signed_sha256,locked_by=null,locked_at=null where id=v.request_id;
 else
  update public.commercial_signature_requests set locked_by=null,locked_at=null where id=v.request_id;
 end if;
 return v_remaining=0;
end;
$func$;
revoke all on function public.finalize_commercial_signature(text,uuid,text,text,text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.finalize_commercial_signature(text,uuid,text,text,text,text,jsonb) to service_role;

-- Preparações não podem mudar quando já existe rodada, mesmo que ainda esteja pendente.
-- Preserva a cadeia de evidências e impede troca silenciosa de signatário.
create or replace function public.guard_commercial_signature_preparation_changes()
returns trigger language plpgsql set search_path='' as $func$
begin
 if exists(select 1 from public.commercial_signature_requests
           where preparation_id=old.id) and
    (new.status is distinct from old.status or new.document_id is distinct from old.document_id) then
   raise exception 'Preparação com assinatura iniciada não pode mudar.' using errcode='42501';
 end if;
 return new;
end;
$func$;
create trigger commercial_signature_preparation_started_guard
 before update on public.commercial_signature_preparations
 for each row execute function public.guard_commercial_signature_preparation_changes();
revoke all on function public.guard_commercial_signature_preparation_changes() from public,anon,authenticated;

-- Reemissão manual por responsável autorizado. O token antigo é revogado
-- e a nova cadeia preserva o identificador anterior e uma justificativa.
alter table public.commercial_signature_invitations
 add column reissue_reason text;

create or replace function public.reissue_commercial_signature_invitation(
 p_invitation_id uuid,p_new_token_hash text,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $reissue$
declare v_inv record;v_new uuid;
begin
 if auth.uid() is null or not public.staff_can_module_action('publicidade','contratos_revisar') then
   raise exception 'Ação restrita a revisor comercial.' using errcode='42501';
 end if;
 if p_new_token_hash !~ '^[a-f0-9]{64}$' or length(btrim(coalesce(p_reason,''))) not between 20 and 1000 then
   raise exception 'Novo token ou justificativa inválidos.' using errcode='23514';
 end if;
 select i.id,i.request_id,i.participant_id,i.status,r.status as request_status
 into v_inv from public.commercial_signature_invitations i
 join public.commercial_signature_requests r on r.id=i.request_id
 where i.id=p_invitation_id for update of i,r;
 if not found or v_inv.status<>'pending' or v_inv.request_status<>'pending' then
   raise exception 'Apenas convite pendente pode ser substituído.' using errcode='23514';
 end if;
 update public.commercial_signature_invitations set
  status='revoked',reissue_reason=btrim(p_reason)
  where id=v_inv.id;
 insert into public.commercial_signature_invitations(
  request_id,participant_id,previous_invitation_id,token_sha256,expires_at
 ) values(v_inv.request_id,v_inv.participant_id,v_inv.id,p_new_token_hash,
          now()+interval '7 days') returning id into v_new;
 return v_new;
end;
$reissue$;
revoke all on function public.reissue_commercial_signature_invitation(uuid,text,text)
 from public,anon;
grant execute on function public.reissue_commercial_signature_invitation(uuid,text,text)
 to authenticated;

-- Evidências comerciais são privadas; leitura só por colaboradores
-- explicitamente autorizados. Não abre edição, remoção ou publicação.
create policy contract_docs_storage_select_commercial_signed_staff
 on storage.objects for select to authenticated
 using(bucket_id='contract-documents'
  and (storage.foldername(name))[1]='commercial-signatures'
  and (public.staff_can_module_action('publicidade','contratos_revisar')
       or public.staff_can_see_module('financeiro')));

comment on table public.commercial_signature_invitations is
 'Tokens individuais com hash e evidências de aceite OTP. Sem vínculo institucional. Arquivos privados e hashes, não ICP-Brasil.';
