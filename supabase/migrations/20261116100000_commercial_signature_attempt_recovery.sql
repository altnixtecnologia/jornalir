-- Recuperação segura e idempotente de uploads parciais de assinatura comercial.
-- Não modifica as tabelas institucionais nem aplica mudanças em produção.
create table public.commercial_signature_attempts(
 invitation_id uuid primary key references public.commercial_signature_invitations(id) on delete restrict,
 request_id uuid not null references public.commercial_signature_requests(id) on delete restrict,
 signer_user_id uuid not null references auth.users(id) on delete restrict,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 signature_sha256 text not null check(signature_sha256 ~ '^[a-f0-9]{64}$'),
 signed_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 constraint commercial_signature_attempt_belongs_to_invite unique(invitation_id,request_id)
);
alter table public.commercial_signature_attempts enable row level security;
revoke all on public.commercial_signature_attempts from public,anon,authenticated;
grant select on public.commercial_signature_attempts to authenticated;
create policy commercial_signature_attempts_staff on public.commercial_signature_attempts
 for select to authenticated using (
  public.staff_can_module_action('publicidade','contratos_revisar')
 );
comment on table public.commercial_signature_attempts is
 'Tentativa persistida antes de gravar evidências: permite concluir após falha parcial sem substituir JPEG/PDF já existente.';

create or replace function public.begin_commercial_signature_attempt(
 p_invitation_id uuid,p_signer_user_id uuid,p_source_sha256 text,p_signature_sha256 text
) returns table(signature_hash text, accepted_at timestamptz)
language plpgsql security definer set search_path='' as $begin_attempt$
declare
 v_inv record;
 v_previous public.commercial_signature_attempts%rowtype;
 v_has_signature boolean;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'Somente serviço.' using errcode='42501';
 end if;
 if p_source_sha256 !~ '^[a-f0-9]{64}$'
    or p_signature_sha256 !~ '^[a-f0-9]{64}$' then
  raise exception 'Hash inválido.' using errcode='23514';
 end if;
 select i.id,i.status,r.id as rid,r.status as request_status,
        r.locked_by,r.locked_at,i.verified_user_id,i.verified_at
 into v_inv
 from public.commercial_signature_invitations i
 join public.commercial_signature_requests r on r.id=i.request_id
 where i.id=p_invitation_id for update of i,r;
 if not found or v_inv.status <> 'pending'
    or v_inv.request_status <> 'pending'
    or v_inv.locked_by is distinct from p_invitation_id
    or v_inv.locked_at is null or v_inv.locked_at < now()-interval '5 minutes'
    or v_inv.verified_user_id is distinct from p_signer_user_id
    or v_inv.verified_at is null or v_inv.verified_at < now()-interval '20 minutes' then
  raise exception 'Tentativa não autorizada.' using errcode='42501';
 end if;
 select * into v_previous from public.commercial_signature_attempts
 where invitation_id=p_invitation_id for update;
 if not found then
   insert into public.commercial_signature_attempts(
     invitation_id,request_id,signer_user_id,source_sha256,signature_sha256
   ) values(p_invitation_id,v_inv.rid,p_signer_user_id,p_source_sha256,p_signature_sha256)
   returning * into v_previous;
 elsif v_previous.request_id is distinct from v_inv.rid
   or v_previous.signer_user_id is distinct from p_signer_user_id
   or v_previous.source_sha256 is distinct from p_source_sha256 then
   raise exception 'Tentativa anterior requer reconciliação assistida.' using errcode='23514';
 elsif v_previous.signature_sha256 is distinct from p_signature_sha256 then
   -- Antes de existir JPEG, o usuário pode redesenhar e reiniciar; se já
   -- houver evidência, o JPEG imutável anterior será reutilizado.
   select exists(select 1 from storage.objects
     where bucket_id='contract-signatures'
       and name='commercial/'||p_invitation_id::text||'.jpg') into v_has_signature;
   if not v_has_signature then
     update public.commercial_signature_attempts set
      signature_sha256=p_signature_sha256,signed_at=now()
     where invitation_id=p_invitation_id returning * into v_previous;
   end if;
 end if;
 return query select v_previous.signature_sha256,v_previous.signed_at;
end;
$begin_attempt$;
revoke all on function public.begin_commercial_signature_attempt(uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.begin_commercial_signature_attempt(uuid,uuid,text,text)
 to service_role;

-- Só uma tentativa persistida do mesmo usuário/convite pode concluir.
-- A verificação dos hashes dos arquivos é realizada pelo servidor antes
-- de chamar finalize_commercial_signature; a base abaixo valida vínculo.
create or replace function public.finalize_commercial_signature(
 p_token_sha256 text,p_auth_user_id uuid,p_original_sha256 text,
 p_signature_sha256 text,p_receipt_sha256 text,p_signed_sha256 text,p_audit jsonb
) returns boolean language plpgsql security definer set search_path='' as $final_attempt$
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
    or v.locked_at is null or v.locked_at<now()-interval '5 minutes'
    or v.verified_user_id is distinct from p_auth_user_id
    or v.verified_at is null or v.verified_at<now()-interval '20 minutes' then
   raise exception 'Tentativa de conclusão inválida.' using errcode='42501';
 end if;
 if p_original_sha256 !~ '^[a-f0-9]{64}$'
 or p_signature_sha256 !~ '^[a-f0-9]{64}$'
 or p_receipt_sha256 !~ '^[a-f0-9]{64}$'
 or p_signed_sha256 !~ '^[a-f0-9]{64}$' then
   raise exception 'Hashes de evidência inválidos.' using errcode='23514';
 end if;
 if not exists(select 1 from public.commercial_signature_attempts a
  where a.invitation_id=v.iid and a.request_id=v.request_id
    and a.signer_user_id=p_auth_user_id
    and a.signature_sha256=p_signature_sha256
    and a.source_sha256=p_original_sha256) then
   raise exception 'Evidência não pertence à tentativa registrada.' using errcode='23514';
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
$final_attempt$;
revoke all on function public.finalize_commercial_signature(text,uuid,text,text,text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.finalize_commercial_signature(text,uuid,text,text,text,text,jsonb)
 to service_role;

-- Evita envio repetido de códigos a partir de um link vazado.
-- Esta reserva atômica é anterior à chamada externa ao Supabase Auth.
alter table public.commercial_signature_invitations
 add column last_otp_requested_at timestamptz,
 add column otp_requests_count integer not null default 0
   check (otp_requests_count between 0 and 8),
 add column otp_window_started_at timestamptz;

create or replace function public.reserve_commercial_signature_otp(
 p_token_sha256 text
) returns void language plpgsql security definer set search_path='' as $otp_reserve$
declare v_inv record;v_count integer;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'Somente serviço.' using errcode='42501';
 end if;
 if p_token_sha256 !~ '^[a-f0-9]{64}$' then
  raise exception 'Convite inválido.' using errcode='23514';
 end if;
 select i.id,i.status,i.expires_at,i.last_otp_requested_at,
   i.otp_requests_count,i.otp_window_started_at,r.status as request_status
 into v_inv
 from public.commercial_signature_invitations i
 join public.commercial_signature_requests r on r.id=i.request_id
 where i.token_sha256=p_token_sha256 for update of i;
 if not found or v_inv.status<>'pending'
   or v_inv.request_status<>'pending' or v_inv.expires_at<=now() then
  raise exception 'Convite indisponível.' using errcode='23514';
 end if;
 if v_inv.last_otp_requested_at > now()-interval '60 seconds' then
  raise exception 'Aguarde um minuto antes de solicitar novo código.'
   using errcode='23514';
 end if;
 v_count:=case when v_inv.otp_window_started_at is null
  or v_inv.otp_window_started_at<=now()-interval '24 hours'
  then 0 else v_inv.otp_requests_count end;
 if v_count>=8 then
  raise exception 'Limite diário de códigos atingido para este convite.'
   using errcode='23514';
 end if;
 update public.commercial_signature_invitations
  set last_otp_requested_at=now(),
   otp_window_started_at=case when v_count=0 then now()
     else v_inv.otp_window_started_at end,
   otp_requests_count=v_count+1 where id=v_inv.id;
end;
$otp_reserve$;
revoke all on function public.reserve_commercial_signature_otp(text)
 from public,anon,authenticated;
grant execute on function public.reserve_commercial_signature_otp(text)
 to service_role;
