-- Planejamento dos signatários comerciais: SEM convites, links ou assinatura.
-- Estruturas exclusivamente comerciais; documentos institucionais intactos.
create table public.commercial_signature_preparations (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.commercial_contract_documents(id) on delete restrict,
 status text not null default 'draft' check (status in ('draft','superseded')),
 superseded_at timestamptz,
 constraint commercial_signers_superseded_consistency check(
   (status='draft' and superseded_at is null) or
   (status='superseded' and superseded_at is not null)
 ),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);
create unique index commercial_signature_one_current_preparation
 on public.commercial_signature_preparations(document_id) where status='draft';
create table public.commercial_signature_participants (
 id uuid primary key default gen_random_uuid(),
 preparation_id uuid not null references public.commercial_signature_preparations(id) on delete restrict,
 signing_order integer not null check(signing_order between 1 and 10),
 signer_role text not null check (signer_role in ('contratante','contratada','testemunha')),
 signer_name text not null check(length(btrim(signer_name)) between 3 and 180),
 signer_email text not null check(length(btrim(signer_email)) between 5 and 254),
 signer_phone text,
 created_at timestamptz not null default now(),
 unique(preparation_id,signing_order),
 unique(preparation_id,signer_email)
);
create index commercial_signature_participants_by_preparation
 on public.commercial_signature_participants(preparation_id,signing_order);

alter table public.commercial_signature_preparations enable row level security;
alter table public.commercial_signature_participants enable row level security;
revoke all on public.commercial_signature_preparations from public,anon,authenticated;
revoke all on public.commercial_signature_participants from public,anon,authenticated;
grant select on public.commercial_signature_preparations to authenticated;
grant select on public.commercial_signature_participants to authenticated;
create policy commercial_signature_preparations_read
 on public.commercial_signature_preparations for select to authenticated
 using(public.staff_can_module_action('publicidade','contratos_revisar'));
create policy commercial_signature_participants_read
 on public.commercial_signature_participants for select to authenticated
 using(public.staff_can_module_action('publicidade','contratos_revisar'));

-- Transação única: não deixa lista parcial se a validação de um signatário
-- falhar. O SECURITY DEFINER contorna apenas a escrita direta, mas exige
-- sessão real + autorização granular verificadas nesta função.
create or replace function public.prepare_commercial_signature_participants(
 p_document_id uuid,p_participants jsonb
) returns uuid language plpgsql security definer set search_path='' as $signers$
declare
 v_document public.commercial_contract_documents%rowtype;
 v_package_status text;
 v_preparation uuid;
 v_row jsonb;
 v_order integer:=0;
 v_role text;
 v_name text;
 v_email text;
 v_phone text;
 v_contratante integer:=0;
 v_contratada integer:=0;
begin
 if auth.uid() is null or not public.staff_can_module_action('publicidade','contratos_revisar') then
   raise exception 'Sem permissão para preparar signatários comerciais.' using errcode='42501';
 end if;
 if jsonb_typeof(p_participants) is distinct from 'array' or
    jsonb_array_length(p_participants) not between 2 and 10 then
   raise exception 'Informe de dois a dez signatários.' using errcode='23514';
 end if;
 select d.* into v_document from public.commercial_contract_documents d
  where d.id=p_document_id for update;
 if not found then
   raise exception 'PDF comercial não encontrado.' using errcode='23503';
 end if;
 select status into v_package_status from public.commercial_contract_packages
  where id=v_document.package_id;
 if v_package_status is distinct from 'legal_approved' then
   raise exception 'Somente contrato com revisão jurídica aprovada pode preparar assinatura.'
    using errcode='23514';
 end if;
 -- Lista anterior permanece registrada, mas deixa de ser a vigente.
 -- FOR UPDATE no PDF serializa revisões do mesmo documento.
 update public.commercial_signature_preparations
   set status='superseded',superseded_at=now()
   where document_id=p_document_id and status='draft';

 insert into public.commercial_signature_preparations(document_id,created_by)
 values(p_document_id,auth.uid()) returning id into v_preparation;

 for v_row in select value from jsonb_array_elements(p_participants)
 loop
   v_order:=v_order+1;
   if jsonb_typeof(v_row) is distinct from 'object' then
     raise exception 'Participante inválido.' using errcode='23514';
   end if;
   v_role:=lower(btrim(coalesce(v_row->>'role','')));
   v_name:=btrim(coalesce(v_row->>'name',''));
   v_email:=lower(btrim(coalesce(v_row->>'email','')));
   v_phone:=regexp_replace(coalesce(v_row->>'phone',''),'[^0-9]','','g');
   if v_role not in ('contratante','contratada','testemunha')
       or length(v_name) not between 3 and 180
       or length(v_email) not between 5 and 254
       or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or (v_phone<>'' and length(v_phone) not between 10 and 13) then
     raise exception 'Verifique nome, e-mail, WhatsApp e função dos signatários.' using errcode='23514';
   end if;
   if v_role='contratante' then v_contratante:=v_contratante+1; end if;
   if v_role='contratada' then v_contratada:=v_contratada+1; end if;
   insert into public.commercial_signature_participants(
    preparation_id,signing_order,signer_role,signer_name,signer_email,signer_phone
   ) values(v_preparation,v_order,v_role,v_name,v_email,nullif(v_phone,''));
 end loop;
 if v_contratante=0 or v_contratada=0 then
   raise exception 'A rodada exige ao menos um representante de cada parte.'
     using errcode='23514';
 end if;
 return v_preparation;
end;
$signers$;
revoke all on function public.prepare_commercial_signature_participants(uuid,jsonb) from public,anon;
grant execute on function public.prepare_commercial_signature_participants(uuid,jsonb) to authenticated;

comment on table public.commercial_signature_preparations is
 'Histórico privado de versões dos signatários propostos para PDF comercial já emitido. Não cria convite nem assina. A ativação da assinatura exige outro fluxo auditado.';
