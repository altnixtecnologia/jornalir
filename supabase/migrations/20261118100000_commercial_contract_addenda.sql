-- Aditivos comerciais: documento autônomo, juridicamente revisado,
-- vinculado ao PDF original. Contrato original e assinador institucional intactos.
create table public.commercial_contract_addenda (
 id uuid primary key default gen_random_uuid(),
 package_id uuid not null references public.commercial_contract_packages(id) on delete restrict,
 original_document_id uuid not null references public.commercial_contract_documents(id) on delete restrict,
 addendum_number integer not null check(addendum_number between 1 and 999),
 title text not null check(length(btrim(title)) between 5 and 180),
 reason text not null check(length(btrim(reason)) between 20 and 2000),
 legal_text text not null check(length(btrim(legal_text)) between 20 and 30000),
 status text not null default 'draft'
  check(status in ('draft','pending_legal_review','legal_approved')),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 approved_by uuid references public.profiles(id) on delete restrict,
 approved_at timestamptz,
 approval_note text,
 last_return_note text check(last_return_note is null or length(btrim(last_return_note)) between 20 and 1000),
 unique(original_document_id,addendum_number),
 check(
  (status='legal_approved' and approved_by is not null and approved_at is not null
   and length(btrim(approval_note)) between 20 and 1000)
  or (status<>'legal_approved' and approved_by is null and approved_at is null
      and approval_note is null)
 )
);
create index commercial_contract_addenda_package_idx
 on public.commercial_contract_addenda(package_id,created_at desc);
create table public.commercial_contract_addendum_events (
 id uuid primary key default gen_random_uuid(),
 addendum_id uuid not null references public.commercial_contract_addenda(id) on delete restrict,
 event_type text not null check(event_type in ('submitted','returned','approved')),
 note text not null,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);
create index commercial_addendum_events_addendum_idx on public.commercial_contract_addendum_events(addendum_id,created_at);

alter table public.commercial_contract_addenda enable row level security;
alter table public.commercial_contract_addendum_events enable row level security;
revoke all on public.commercial_contract_addenda,public.commercial_contract_addendum_events from public,anon,authenticated;
grant select,insert,update on public.commercial_contract_addenda to authenticated;
grant select on public.commercial_contract_addendum_events to authenticated;
create policy commercial_addenda_read on public.commercial_contract_addenda for select to authenticated
 using(public.staff_can_module_action('publicidade','contratos_preparar')
    or public.staff_can_module_action('publicidade','contratos_revisar')
    or public.staff_can_see_module('financeiro'));
create policy commercial_addenda_insert on public.commercial_contract_addenda for insert to authenticated
 with check(public.staff_can_module_action('publicidade','contratos_preparar'));
create policy commercial_addenda_edit on public.commercial_contract_addenda for update to authenticated
 using(public.staff_can_module_action('publicidade','contratos_preparar')
    or public.staff_can_module_action('publicidade','contratos_revisar'))
 with check(public.staff_can_module_action('publicidade','contratos_preparar')
    or public.staff_can_module_action('publicidade','contratos_revisar'));
create policy commercial_addendum_events_read on public.commercial_contract_addendum_events for select to authenticated
 using(public.staff_can_module_action('publicidade','contratos_preparar')
   or public.staff_can_module_action('publicidade','contratos_revisar')
   or public.staff_can_see_module('financeiro'));

create or replace function public.guard_commercial_addendum()
returns trigger language plpgsql security definer set search_path='' as $guard_addendum$
declare v_original record;v_next integer;v_note text;
begin
 if tg_op='DELETE' then
  raise exception 'Aditivo não pode ser excluído; o histórico é imutável.' using errcode='42501';
 end if;
 if tg_op='INSERT' then
  if auth.uid() is null or not public.staff_can_module_action('publicidade','contratos_preparar') then
   raise exception 'Cadastro de aditivo sem permissão.' using errcode='42501';
  end if;
  select d.id,d.package_id,d.addendum_id,p.status into v_original
   from public.commercial_contract_documents d
   join public.commercial_contract_packages p on p.id=d.package_id
   where d.id=new.original_document_id;
  if not found or v_original.package_id is distinct from new.package_id
    or v_original.addendum_id is not null or v_original.status<>'legal_approved' then
   raise exception 'Selecione um contrato comercial original aprovado e emitido.' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtext(new.original_document_id::text));
  select coalesce(max(addendum_number),0)+1 into v_next
   from public.commercial_contract_addenda
   where original_document_id=new.original_document_id;
  new.addendum_number:=v_next;
  new.status:='draft';
  new.created_by:=auth.uid();
  new.approved_by:=null;new.approved_at:=null;new.approval_note:=null;
  return new;
 end if;
 if new.package_id is distinct from old.package_id
   or new.original_document_id is distinct from old.original_document_id
   or new.addendum_number is distinct from old.addendum_number
   or new.created_by is distinct from old.created_by
   or new.created_at is distinct from old.created_at then
  raise exception 'Origem do aditivo é imutável.' using errcode='42501';
 end if;
 if old.status='legal_approved' then
  raise exception 'Aditivo juridicamente aprovado é imutável. Emita o PDF ou crie outro aditivo.'
   using errcode='42501';
 end if;
 if old.status='draft' then
  if not public.staff_can_module_action('publicidade','contratos_preparar') then
   raise exception 'Preparação restrita.' using errcode='42501';
  end if;
  if new.status not in ('draft','pending_legal_review') then
   raise exception 'Encaminhe o aditivo à revisão antes de aprovar.' using errcode='23514';
  end if;
  if new.status='pending_legal_review' then
   if length(btrim(new.legal_text))<300 or
      new.legal_text !~* 'CONTRATANTE' or new.legal_text !~* 'CONTRATADA' or
      new.legal_text !~* 'ADITIVO' then
    raise exception 'Aditivo precisa qualificar as partes e conter texto jurídico completo.'
     using errcode='23514';
   end if;
   new.last_return_note:=null;
   insert into public.commercial_contract_addendum_events(addendum_id,event_type,note,actor_id)
    values(old.id,'submitted','Encaminhado para conferência jurídica',auth.uid());
  end if;
 elsif old.status='pending_legal_review' then
  if new.status='draft' then
   if not public.staff_can_module_action('publicidade','contratos_revisar') then
    raise exception 'Devolução restrita ao revisor.' using errcode='42501';
   end if;
   if new.title is distinct from old.title or new.reason is distinct from old.reason
    or new.legal_text is distinct from old.legal_text then
    raise exception 'Retorne para rascunho antes de editar o conteúdo.' using errcode='23514';
   end if;
   if length(btrim(coalesce(new.last_return_note,''))) not between 20 and 1000 then
    raise exception 'Justifique a devolução do aditivo em 20 a 1000 caracteres.' using errcode='23514';
   end if;
   insert into public.commercial_contract_addendum_events(addendum_id,event_type,note,actor_id)
    values(old.id,'returned',btrim(new.last_return_note),auth.uid());
  elsif new.status='legal_approved' then
   if not public.staff_can_module_action('publicidade','contratos_revisar') then
    raise exception 'Aprovação jurídica restrita.' using errcode='42501';
   end if;
   if new.title is distinct from old.title or new.reason is distinct from old.reason
    or new.legal_text is distinct from old.legal_text then
    raise exception 'Texto em conferência não pode ser alterado na aprovação.' using errcode='23514';
   end if;
   v_note:=btrim(coalesce(new.approval_note,''));
   if length(v_note) not between 20 and 1000 then
    raise exception 'Justifique a revisão jurídica em 20 a 1000 caracteres.'
     using errcode='23514';
   end if;
   new.approved_by:=auth.uid();new.approved_at:=now();
   new.approval_note:=v_note;
   insert into public.commercial_contract_addendum_events(addendum_id,event_type,note,actor_id)
    values(old.id,'approved',v_note,auth.uid());
  else
   raise exception 'Estado de revisão inválido.' using errcode='23514';
  end if;
 else
  raise exception 'Transição de aditivo inválida.' using errcode='23514';
 end if;
 if new.status<>'legal_approved' then
  new.approved_by:=null;new.approved_at:=null;new.approval_note:=null;
 end if;
 new.updated_at:=now();
 return new;
end;
$guard_addendum$;
create trigger commercial_addenda_guard before insert or update or delete
 on public.commercial_contract_addenda for each row execute function public.guard_commercial_addendum();
revoke all on function public.guard_commercial_addendum() from public,anon,authenticated;

-- PDF do aditivo usa a mesma cadeia privada/assinatura comercial, mas tem
-- índice próprio, mantendo o contrato original único e imutável.
alter table public.commercial_contract_documents
 add column addendum_id uuid unique references public.commercial_contract_addenda(id) on delete restrict;
drop index if exists public.commercial_contract_docs_combined_unique;
drop index if exists public.commercial_contract_docs_service_unique;
create unique index commercial_contract_docs_combined_unique
 on public.commercial_contract_documents(package_id)
 where service_id is null and addendum_id is null;
create unique index commercial_contract_docs_service_unique
 on public.commercial_contract_documents(package_id,service_id)
 where service_id is not null and addendum_id is null;

-- Quem prepara aditivos precisa ver a identidade/documento fonte.
-- O download do PDF original permanece restrito pelo RLS de Storage.
drop policy if exists commercial_documents_read on public.commercial_contract_documents;
create policy commercial_documents_read on public.commercial_contract_documents
 for select to authenticated using(
  public.staff_can_module_action('publicidade','contratos_preparar')
  or public.staff_can_module_action('publicidade','contratos_revisar')
  or public.staff_can_see_module('financeiro')
);

create or replace function public.guard_commercial_document_evidence()
returns trigger language plpgsql set search_path='' as $guard_document$
declare
 v_pkg record;v_selected uuid;v_version integer;v_current integer;v_active boolean;v_amend record;
begin
 if tg_op<>'INSERT' then
  raise exception 'Documentos comerciais são imutáveis.' using errcode='42501';
 end if;
 if not public.staff_can_module_action('publicidade','contratos_revisar') then
  raise exception 'Emissão exige revisor autorizado.' using errcode='42501';
 end if;
 select status,document_mode into v_pkg from public.commercial_contract_packages
  where id=new.package_id for update;
 if v_pkg.status is distinct from 'legal_approved' then
  raise exception 'Somente contratação juridicamente conferida pode emitir PDF.'
   using errcode='23514';
 end if;
 if new.addendum_id is not null then
  select a.id,a.package_id,a.status,original.service_id,
   original.template_id,original.template_version,a.title
  into v_amend
  from public.commercial_contract_addenda a
  join public.commercial_contract_documents original on original.id=a.original_document_id
  where a.id=new.addendum_id for update of a;
  if not found or v_amend.package_id is distinct from new.package_id
   or v_amend.status<>'legal_approved'
   or new.title is distinct from v_amend.title
   or new.service_id is distinct from v_amend.service_id
   or new.template_id is distinct from v_amend.template_id
   or new.template_version is distinct from v_amend.template_version then
   raise exception 'Aditivo não aprovado ou incompatível com contrato original.'
    using errcode='23514';
  end if;
 else
  if (v_pkg.document_mode='combined' and new.service_id is not null)
    or (v_pkg.document_mode='separate' and new.service_id is null) then
   raise exception 'Documento não corresponde ao agrupamento aprovado.' using errcode='23514';
  end if;
  if new.service_id is not null and not exists(
    select 1 from public.commercial_contract_services
    where id=new.service_id and package_id=new.package_id
  ) then
   raise exception 'Serviço não pertence à contratação.' using errcode='23514';
  end if;
  select a.template_id into v_selected from public.commercial_contract_template_assignments a
   where a.package_id=new.package_id and a.service_id is not distinct from new.service_id;
  if v_selected is distinct from new.template_id then
   raise exception 'O modelo não é o modelo juridicamente selecionado.' using errcode='23514';
  end if;
  select t.version,t.active,
    (select max(t2.version) from public.contract_templates t2 where t2.group_id=t.group_id)
  into v_version,v_active,v_current from public.contract_templates t where t.id=new.template_id;
  if v_version is distinct from new.template_version or not coalesce(v_active,false)
    or v_current is distinct from v_version then
   raise exception 'A versão do modelo é inválida ou não está atual.' using errcode='23514';
  end if;
 end if;
 if new.file_reference is distinct from
   ('commercial-contracts/'||new.package_id::text||'/'||new.id::text||'.pdf') then
  raise exception 'Caminho privado de evidência inválido.' using errcode='23514';
 end if;
 if not exists(select 1 from storage.objects o
  where o.bucket_id='contract-documents' and o.name=new.file_reference) then
  raise exception 'PDF privado ainda não foi armazenado.' using errcode='23514';
 end if;
 new.issued_by:=auth.uid();
 if new.issued_by is null then
  raise exception 'Sessão de emissor obrigatória.' using errcode='42501';
 end if;
 return new;
end;
$guard_document$;

-- É proibido alterar/adicionar PDFs ao original sem revisão jurídica.
comment on table public.commercial_contract_addenda is
 'Termos aditivos comerciais versionados e aprovados antes da emissão; não altera venda nem parcelas.';
