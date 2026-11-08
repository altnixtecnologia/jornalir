-- Etapa 3A — Assinatura eletrônica pela EMPRESA e preparação do documento.
-- Aditiva. NÃO aplicar sem autorização; conferir o ledger antes e nunca reaplicar.
-- Escritas só pelo servidor (service_role) após checar permissão; usuários só leem.
--
-- 1) Representante legal ↔ usuário autenticado (para confirmar a assinatura).
-- 2) Rodada de assinatura da empresa (comercial e institucional) + assinaturas imutáveis.
-- 3) Layout manual de campos por versão de modelo (reutilizável).
-- 4) Barreira: convite ao CLIENTE só depois da empresa concluir (os dois fluxos).
-- 5) Comercial: a 'contratada' deixa de receber convite externo (assina em sistema) e a
--    base da assinatura do cliente passa a ser o PDF já assinado pela empresa.

alter table public.company_legal_representatives
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create unique index if not exists company_legal_representatives_profile_key
  on public.company_legal_representatives (profile_id) where profile_id is not null;

comment on column public.company_legal_representatives.profile_id is
  'Usuário do sistema que É este representante: só ele confirma a assinatura institucional, autenticado. Definido por admin/owner.';

-- ---------------------------------------------------------------------------
create table public.contract_company_signature_rounds (
  id uuid primary key,
  modality text not null check (modality in ('commercial', 'institutional')),
  commercial_document_id uuid references public.commercial_contract_documents (id) on delete restrict,
  contract_id uuid references public.institutional_contracts (id) on delete restrict,
  source_document_id uuid references public.contract_documents (id) on delete restrict,
  status text not null default 'preparing' check (status in ('preparing', 'signing', 'completed', 'cancelled')),
  representative_id uuid references public.company_legal_representatives (id) on delete restrict,
  required_representative_ids uuid[] not null default '{}',
  required_signatures integer not null check (required_signatures between 1 and 5),
  signer_slots jsonb not null check (jsonb_typeof(signer_slots) = 'array'),
  layout_mode text not null check (layout_mode in ('automatic', 'manual')),
  layout_fields jsonb not null check (jsonb_typeof(layout_fields) = 'array'),
  document_title text not null check (char_length(document_title) between 1 and 300),
  original_path text not null,
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  prepared_path text not null,
  prepared_sha256 text not null check (prepared_sha256 ~ '^[0-9a-f]{64}$'),
  final_path text,
  final_sha256 text check (final_sha256 is null or final_sha256 ~ '^[0-9a-f]{64}$'),
  final_document_id uuid references public.contract_documents (id) on delete set null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) between 20 and 1000),
  locked_by uuid,
  locked_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint company_round_modality_refs check (
    (modality = 'commercial' and commercial_document_id is not null and contract_id is null and source_document_id is null)
    or (modality = 'institutional' and contract_id is not null and source_document_id is not null and commercial_document_id is null)
  ),
  constraint company_round_completed_consistency check (
    (status = 'completed' and final_path is not null and final_sha256 is not null and completed_at is not null)
    or (status <> 'completed' and final_path is null and final_sha256 is null and completed_at is null)
  ),
  constraint company_round_cancelled_consistency check (
    (status = 'cancelled' and cancelled_at is not null and cancel_reason is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  )
);

create unique index company_round_one_active_commercial
  on public.contract_company_signature_rounds (commercial_document_id) where status <> 'cancelled' and commercial_document_id is not null;
create unique index company_round_one_active_institutional
  on public.contract_company_signature_rounds (source_document_id) where status <> 'cancelled' and source_document_id is not null;
create index company_round_contract_idx on public.contract_company_signature_rounds (contract_id) where contract_id is not null;

create table public.contract_company_signatures (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.contract_company_signature_rounds (id) on delete restrict,
  sequence integer not null check (sequence between 1 and 5),
  signer_key text not null check (char_length(signer_key) between 1 and 60),
  signer_profile_id uuid not null references public.profiles (id) on delete restrict,
  representative_id uuid references public.company_legal_representatives (id) on delete restrict,
  signer_name text not null,
  signer_title text not null,
  powers_snapshot text not null,
  representation_rule text not null check (representation_rule in ('individual', 'joint', 'authorized_user')),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  signed_path text not null,
  signed_sha256 text not null check (signed_sha256 ~ '^[0-9a-f]{64}$'),
  signature_png_sha256 text check (signature_png_sha256 is null or signature_png_sha256 ~ '^[0-9a-f]{64}$'),
  consent_version text not null default 'company-v1',
  signed_at timestamptz not null default now(),
  audit_metadata jsonb not null default '{}'::jsonb,
  unique (round_id, sequence),
  unique (round_id, signer_key),
  unique (round_id, signer_profile_id),
  unique (round_id, representative_id)
);

comment on table public.contract_company_signatures is
  'Confirmações de assinatura da EMPRESA. Imutáveis (sem update/delete). Cada linha guarda quem, com que poderes, o hash antes/depois e a data/hora. A imagem PNG é só representação visual (hash em signature_png_sha256). Não é ICP-Brasil.';

create or replace function public.reject_company_signature_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Assinaturas da empresa são imutáveis.' using errcode = '42501';
end;
$$;
create trigger contract_company_signatures_immutable
  before update or delete on public.contract_company_signatures
  for each row execute function public.reject_company_signature_mutation();

-- Depois que a assinatura começa, nem representante nem documento mudam (nem em silêncio).
create or replace function public.guard_company_round_changes()
returns trigger language plpgsql set search_path = '' as $$
declare v_started boolean;
begin
  if old.status in ('completed', 'cancelled') then
    raise exception 'Rodada encerrada não pode ser alterada.' using errcode = '42501';
  end if;
  select exists (select 1 from public.contract_company_signatures where round_id = old.id) into v_started;
  if (v_started or old.status = 'signing') and (
       new.representative_id is distinct from old.representative_id
    or new.required_representative_ids is distinct from old.required_representative_ids
    or new.required_signatures is distinct from old.required_signatures
    or new.signer_slots is distinct from old.signer_slots
    or new.layout_mode is distinct from old.layout_mode
    or new.layout_fields is distinct from old.layout_fields
    or new.original_path is distinct from old.original_path
    or new.original_sha256 is distinct from old.original_sha256
    or new.prepared_path is distinct from old.prepared_path
    or new.prepared_sha256 is distinct from old.prepared_sha256
    or new.commercial_document_id is distinct from old.commercial_document_id
    or new.contract_id is distinct from old.contract_id
    or new.source_document_id is distinct from old.source_document_id
  ) then
    raise exception 'Assinatura iniciada: representante e documento não podem ser trocados. Cancele a rodada com justificativa.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger contract_company_signature_rounds_guard
  before update on public.contract_company_signature_rounds
  for each row execute function public.guard_company_round_changes();

alter table public.contract_company_signature_rounds enable row level security;
alter table public.contract_company_signatures enable row level security;
revoke all on public.contract_company_signature_rounds from public, anon, authenticated;
revoke all on public.contract_company_signatures from public, anon, authenticated;
grant select on public.contract_company_signature_rounds to authenticated;
grant select on public.contract_company_signatures to authenticated;
grant select, insert, update on public.contract_company_signature_rounds to service_role;
grant select, insert on public.contract_company_signatures to service_role;

create policy company_rounds_staff_read on public.contract_company_signature_rounds
  for select to authenticated
  using (public.staff_can_module_action('publicidade', 'contratos_revisar') or public.staff_can_see_module('financeiro'));
create policy company_signatures_staff_read on public.contract_company_signatures
  for select to authenticated
  using (public.staff_can_module_action('publicidade', 'contratos_revisar') or public.staff_can_see_module('financeiro'));

-- ---------------------------------------------------------------------------
-- Vez de assinar (exclusão mútua curta + duplicidade) e conclusão transacional.
create or replace function public.claim_company_signature_turn(
  p_round_id uuid, p_profile_id uuid, p_representative_id uuid, p_signer_key text
) returns table (base_path text, base_sha256 text, next_sequence integer)
language plpgsql security definer set search_path = '' as $$
declare v public.contract_company_signature_rounds%rowtype; v_last record; v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Somente serviço.' using errcode = '42501'; end if;
  select * into v from public.contract_company_signature_rounds where id = p_round_id for update;
  if not found or v.status not in ('preparing', 'signing') then
    raise exception 'Rodada indisponível para assinatura.' using errcode = '23514';
  end if;
  if v.locked_by is not null and v.locked_by is distinct from p_profile_id and v.locked_at > now() - interval '5 minutes' then
    raise exception 'Outra assinatura está sendo concluída. Tente novamente em instantes.' using errcode = '55P03';
  end if;
  select count(*) into v_count from public.contract_company_signatures where round_id = p_round_id;
  if v_count >= v.required_signatures then
    raise exception 'Todas as assinaturas exigidas já foram registradas.' using errcode = '23514';
  end if;
  if exists (select 1 from public.contract_company_signatures
              where round_id = p_round_id
                and (signer_profile_id = p_profile_id or signer_key = p_signer_key
                     or (p_representative_id is not null and representative_id = p_representative_id))) then
    raise exception 'Este signatário já assinou o documento.' using errcode = '23505';
  end if;
  if v.modality = 'institutional' and (p_representative_id is null or not (p_representative_id = any (v.required_representative_ids))) then
    raise exception 'Representante não exigido para este documento.' using errcode = '42501';
  end if;
  update public.contract_company_signature_rounds set locked_by = p_profile_id, locked_at = now() where id = p_round_id;
  select s.signed_path, s.signed_sha256 into v_last from public.contract_company_signatures s
    where s.round_id = p_round_id order by s.sequence desc limit 1;
  return query select coalesce(v_last.signed_path, v.prepared_path), coalesce(v_last.signed_sha256, v.prepared_sha256), v_count + 1;
end;
$$;
revoke all on function public.claim_company_signature_turn(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_company_signature_turn(uuid, uuid, uuid, text) to service_role;

create or replace function public.release_company_signature_turn(p_round_id uuid, p_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Somente serviço.' using errcode = '42501'; end if;
  update public.contract_company_signature_rounds set locked_by = null, locked_at = null
   where id = p_round_id and locked_by = p_profile_id and status in ('preparing', 'signing');
end;
$$;
revoke all on function public.release_company_signature_turn(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_company_signature_turn(uuid, uuid) to service_role;

create or replace function public.finalize_company_signature(
  p_round_id uuid, p_profile_id uuid, p_representative_id uuid, p_signer_key text, p_signer_name text,
  p_signer_title text, p_powers_snapshot text, p_representation_rule text, p_source_sha256 text,
  p_signed_path text, p_signed_sha256 text, p_png_sha256 text, p_audit jsonb
) returns table (completed boolean, final_document_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v public.contract_company_signature_rounds%rowtype;
  v_count integer; v_seq integer; v_prefix text; v_doc uuid; v_done boolean := false; v_source public.contract_documents%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Somente serviço.' using errcode = '42501'; end if;
  select * into v from public.contract_company_signature_rounds where id = p_round_id for update;
  if not found or v.status not in ('preparing', 'signing')
     or v.locked_by is distinct from p_profile_id or v.locked_at is null or v.locked_at < now() - interval '5 minutes' then
    raise exception 'Tentativa de conclusão inválida.' using errcode = '42501';
  end if;
  if p_source_sha256 !~ '^[0-9a-f]{64}$' or p_signed_sha256 !~ '^[0-9a-f]{64}$'
     or (p_png_sha256 is not null and p_png_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'Hashes de evidência inválidos.' using errcode = '23514';
  end if;
  v_prefix := case v.modality
    when 'commercial' then 'commercial-company-signatures/' || v.id::text || '/'
    else 'contracts/' || v.contract_id::text || '/company-signing/' || v.id::text || '/' end;
  if left(p_signed_path, length(v_prefix)) <> v_prefix then
    raise exception 'Caminho da evidência fora da pasta da rodada.' using errcode = '23514';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'contract-documents' and name = p_signed_path) then
    raise exception 'PDF assinado não armazenado.' using errcode = '23514';
  end if;
  select count(*) into v_count from public.contract_company_signatures where round_id = p_round_id;
  if v_count >= v.required_signatures then raise exception 'Assinaturas já completas.' using errcode = '23514'; end if;
  v_seq := v_count + 1;

  insert into public.contract_company_signatures (
    round_id, sequence, signer_key, signer_profile_id, representative_id, signer_name, signer_title, powers_snapshot,
    representation_rule, source_sha256, signed_path, signed_sha256, signature_png_sha256, audit_metadata
  ) values (
    p_round_id, v_seq, p_signer_key, p_profile_id, p_representative_id, p_signer_name, p_signer_title, p_powers_snapshot,
    p_representation_rule, p_source_sha256, p_signed_path, p_signed_sha256, p_png_sha256, coalesce(p_audit, '{}'::jsonb)
  );

  if v_seq >= v.required_signatures then
    v_done := true;
    if v.modality = 'institutional' then
      select * into v_source from public.contract_documents where id = v.source_document_id;
      insert into public.contract_documents (contract_id, document_type, name, file_reference, notes, extracted_data)
      values (v.contract_id, v_source.document_type, left('Versão assinada pela empresa - ' || v_source.name, 180), p_signed_path,
              'Documento com rubricas e assinatura(s) da empresa aplicadas após confirmação eletrônica. Não é certificado ICP-Brasil.',
              jsonb_build_object('companySignatureRoundId', v.id, 'sourceDocumentId', v.source_document_id,
                                 'originalSha256', v.original_sha256, 'signedSha256', p_signed_sha256))
      returning id into v_doc;
    end if;
    update public.contract_company_signature_rounds set status = 'completed', completed_at = now(),
      final_path = p_signed_path, final_sha256 = p_signed_sha256, final_document_id = v_doc, locked_by = null, locked_at = null
     where id = p_round_id;
  else
    update public.contract_company_signature_rounds set status = 'signing', locked_by = null, locked_at = null where id = p_round_id;
  end if;

  insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
  values (p_profile_id, 'contract_company_signature_round', p_round_id, 'company_signature_recorded',
          jsonb_build_object('sequence', v_seq, 'signerKey', p_signer_key, 'representativeId', p_representative_id,
                             'sourceSha256', p_source_sha256, 'signedSha256', p_signed_sha256, 'completed', v_done));
  return query select v_done, v_doc;
end;
$$;
revoke all on function public.finalize_company_signature(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_company_signature(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb) to service_role;

create or replace function public.cancel_company_signature_round(p_round_id uuid, p_actor uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.contract_company_signature_rounds%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Somente serviço.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 20 and 1000 then
    raise exception 'Justificativa de 20 a 1000 caracteres obrigatória.' using errcode = '23514';
  end if;
  select * into v from public.contract_company_signature_rounds where id = p_round_id for update;
  if not found or v.status not in ('preparing', 'signing') then
    raise exception 'Somente rodada em andamento pode ser cancelada.' using errcode = '23514';
  end if;
  update public.contract_company_signature_rounds set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor,
    cancel_reason = btrim(p_reason), locked_by = null, locked_at = null where id = p_round_id;
  insert into public.audit_events (user_id, entity_type, entity_id, action, metadata)
  values (p_actor, 'contract_company_signature_round', p_round_id, 'company_signature_round_cancelled_db',
          jsonb_build_object('reason', btrim(p_reason), 'previousStatus', v.status));
end;
$$;
revoke all on function public.cancel_company_signature_round(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_company_signature_round(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Layout manual de campos por versão do modelo (PDF externo/modelo especial).
create table public.contract_signature_field_layouts (
  template_id uuid primary key references public.contract_templates (id) on delete cascade,
  fields jsonb not null check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) between 1 and 400),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger contract_signature_field_layouts_set_updated_at
  before update on public.contract_signature_field_layouts for each row execute function public.set_updated_at();
alter table public.contract_signature_field_layouts enable row level security;
revoke all on public.contract_signature_field_layouts from public, anon, authenticated;
grant select, insert, update, delete on public.contract_signature_field_layouts to authenticated;
grant select on public.contract_signature_field_layouts to service_role;
create policy field_layouts_select on public.contract_signature_field_layouts for select to authenticated
  using (public.is_active_admin_or_owner() or public.staff_can_module_action('publicidade', 'contratos_preparar')
         or public.staff_can_module_action('publicidade', 'contratos_revisar'));
create policy field_layouts_write on public.contract_signature_field_layouts for all to authenticated
  using (public.is_active_admin_or_owner()) with check (public.is_active_admin_or_owner());
comment on table public.contract_signature_field_layouts is
  'Posições (normalizadas 0..1, origem topo-esquerda) dos campos de assinatura/rubrica por versão de modelo especial. O modo automático dos modelos internos não usa esta tabela.';

-- ---------------------------------------------------------------------------
-- Barreira: convite ao CLIENTE só depois que a empresa concluiu a assinatura.
create or replace function public.require_company_signature_before_institutional_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.contract_company_signature_rounds r
                  where r.status = 'completed' and r.contract_id = new.contract_id and r.final_document_id = new.document_id) then
    raise exception 'O documento precisa estar assinado pela empresa antes do convite ao cliente.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.require_company_signature_before_institutional_invite() from public, anon, authenticated;
create trigger contract_signature_invitations_company_first
  before insert on public.contract_signature_invitations
  for each row execute function public.require_company_signature_before_institutional_invite();

create or replace function public.require_company_signature_before_commercial_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.commercial_signature_requests q
    join public.commercial_signature_preparations p on p.id = q.preparation_id
    join public.contract_company_signature_rounds r on r.commercial_document_id = p.document_id and r.status = 'completed'
    where q.id = new.request_id
  ) then
    raise exception 'O documento precisa estar assinado pela empresa antes do convite ao cliente.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.require_company_signature_before_commercial_invite() from public, anon, authenticated;
create trigger commercial_signature_invitations_company_first
  before insert on public.commercial_signature_invitations
  for each row execute function public.require_company_signature_before_commercial_invite();

-- ---------------------------------------------------------------------------
-- Comercial: a 'contratada' assina em sistema (rodada da empresa), não por convite externo.
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
 if not exists(select 1 from public.contract_company_signature_rounds
               where commercial_document_id=v_prep.document_id and status='completed') then
   raise exception 'O documento precisa estar assinado pela empresa antes do convite ao cliente.' using errcode='23514';
 end if;
 if exists(select 1 from public.commercial_signature_requests
           where preparation_id=p_preparation_id) then
   raise exception 'Esta lista já possui rodada de assinaturas.' using errcode='23505';
 end if;
 select count(*) into v_count from public.commercial_signature_participants
  where preparation_id=p_preparation_id and signer_role<>'contratada';
 if v_count not between 1 and 10
    or jsonb_typeof(p_invites) is distinct from 'array'
    or jsonb_array_length(p_invites)<>v_count then
   raise exception 'Forneça um token por participante do cliente.' using errcode='23514';
 end if;
 insert into public.commercial_signature_requests(preparation_id,created_by)
 values(p_preparation_id,auth.uid()) returning id into v_request;
 for v_participant in
   select id,signing_order from public.commercial_signature_participants
   where preparation_id=p_preparation_id and signer_role<>'contratada' order by signing_order
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

-- Base da assinatura do cliente: PDF anterior do cliente, senão o PDF assinado pela EMPRESA, senão o original.
create or replace function public.claim_commercial_signature_turn(
 p_token_sha256 text,p_auth_user_id uuid
) returns table(invitation_id uuid,request_id uuid,source_path text,source_sha256 text,document_title text)
 language plpgsql security definer set search_path='' as $func$
declare v record; v_preceding integer; v_company record;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'Somente serviço.' using errcode='42501';
 end if;
 select i.id as iid,i.request_id,i.verified_at,i.verified_user_id,
   i.expires_at,i.status,r.status as request_status,r.locked_by,r.locked_at,
   p.signing_order,p.signer_email,d.id as document_id,d.file_reference,d.sha256,d.title
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
 select final_path,final_sha256 into v_company from public.contract_company_signature_rounds
  where commercial_document_id=v.document_id and status='completed';
 if not found then
   raise exception 'O documento ainda não foi assinado pela empresa.' using errcode='23514';
 end if;
 select count(*) into v_preceding from public.commercial_signature_participants p
 join public.commercial_signature_preparations prep on prep.id=p.preparation_id
 join public.commercial_signature_requests req on req.preparation_id=prep.id
 where req.id=v.request_id and p.signing_order<v.signing_order and p.signer_role<>'contratada'
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
    order by p.signing_order desc limit 1),v_company.final_path),
  coalesce((select previous.signed_sha256
    from public.commercial_signature_invitations previous
    join public.commercial_signature_participants p on p.id=previous.participant_id
    where previous.request_id=v.request_id and previous.status='signed'
    order by p.signing_order desc limit 1),v_company.final_sha256),v.title;
end;
$func$;
revoke all on function public.claim_commercial_signature_turn(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_commercial_signature_turn(text,uuid) to service_role;
