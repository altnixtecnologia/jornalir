-- Registro de aprovação humana e evidência imutável de documentos comerciais.
-- NÃO estende institutional_contracts nem contract_signature_invitations.
-- Nenhuma emissão, cobrança ou assinatura automática nesta migration.
alter table public.commercial_contract_packages
  drop constraint if exists commercial_contract_packages_status_check;
alter table public.commercial_contract_packages
  add constraint commercial_contract_packages_status_check
  check (status in ('draft','pending_legal_review','legal_approved'));
alter table public.commercial_contract_packages
  add column approved_by uuid references public.profiles(id) on delete restrict,
  add column approved_at timestamptz,
  add column approval_note text;
alter table public.commercial_contract_packages
  add constraint commercial_package_legal_approval_consistent
  check (
    (status='legal_approved' and approved_by is not null
     and approved_at is not null and length(btrim(approval_note))>=20)
    or (status<>'legal_approved' and approved_by is null
        and approved_at is null and approval_note is null)
  );

create or replace function public.guard_commercial_legal_approval()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if old.status='legal_approved' then
      -- Correção controlada ANTES da primeira emissão: nenhum PDF/evidência
      -- pode ser apagado ou refeito. Após a emissão, só aditivo.
      if new.status='draft' and
         public.staff_can_module_action('publicidade','contratos_revisar')
         and not exists(
           select 1 from public.commercial_contract_documents d
           where d.package_id=old.id
         ) then
        new.approved_by:=null;
        new.approved_at:=null;
        new.approval_note:=null;
        return new;
      end if;
      raise exception 'Contratação aprovada é imutável após emissão; use aditivo.'
        using errcode='42501';
    end if;
    if new.status='legal_approved' then
      if old.status<>'pending_legal_review' or
         not public.staff_can_module_action('publicidade','contratos_revisar') then
        raise exception 'A aprovação jurídica exige revisor autorizado e revisão pendente.'
          using errcode='42501';
      end if;
      if length(btrim(coalesce(new.approval_note,'')))<20 then
        raise exception 'Justifique a conferência jurídica (mínimo 20 caracteres).'
          using errcode='23514';
      end if;
      new.approved_by:=auth.uid();
      if new.approved_by is null then
        raise exception 'Sessão autenticada obrigatória.' using errcode='42501';
      end if;
      new.approved_at:=now();
    elsif new.approved_by is distinct from old.approved_by or
          new.approved_at is distinct from old.approved_at or
          new.approval_note is distinct from old.approval_note then
      raise exception 'Dados de aprovação são protegidos.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger commercial_package_legal_approval_guard
before update on public.commercial_contract_packages
for each row execute function public.guard_commercial_legal_approval();

-- PDF original nunca é atualizado/excluído. Cada serviço tem um documento,
-- ou um documento único com service_id NULL para todos os serviços.
create table public.commercial_contract_documents (
  id uuid primary key,
  package_id uuid not null references public.commercial_contract_packages(id) on delete restrict,
  service_id uuid references public.commercial_contract_services(id) on delete restrict,
  template_id uuid not null references public.contract_templates(id) on delete restrict,
  template_version integer not null check(template_version>0),
  file_reference text not null unique,
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null check(size_bytes between 1 and 4194304),
  title text not null check(length(btrim(title)) between 3 and 180),
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default now()
);
create unique index commercial_contract_docs_combined_unique
  on public.commercial_contract_documents(package_id) where service_id is null;
create unique index commercial_contract_docs_service_unique
  on public.commercial_contract_documents(package_id,service_id) where service_id is not null;
create index commercial_contract_docs_package_idx
  on public.commercial_contract_documents(package_id,issued_at desc);

create or replace function public.guard_commercial_document_evidence()
returns trigger language plpgsql set search_path='' as $$
declare
  v_pkg record;
  v_selected uuid;
  v_version integer;
  v_current integer;
  v_active boolean;
begin
  if tg_op<>'INSERT' then
    raise exception 'Documentos comerciais são imutáveis.' using errcode='42501';
  end if;
  if not public.staff_can_module_action('publicidade','contratos_revisar') then
    raise exception 'Emissão exige revisor autorizado.' using errcode='42501';
  end if;
  select status,document_mode into v_pkg
    from public.commercial_contract_packages where id=new.package_id for update;
  if v_pkg.status is distinct from 'legal_approved' then
    raise exception 'Somente contratação juridicamente conferida pode emitir PDF.'
      using errcode='23514';
  end if;
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
  select a.template_id into v_selected
    from public.commercial_contract_template_assignments a
    where a.package_id=new.package_id and a.service_id is not distinct from new.service_id;
  if v_selected is distinct from new.template_id then
    raise exception 'O modelo não é o modelo juridicamente selecionado.' using errcode='23514';
  end if;
  select t.version,t.active,
    (select max(t2.version) from public.contract_templates t2 where t2.group_id=t.group_id)
    into v_version,v_active,v_current
    from public.contract_templates t where t.id=new.template_id;
  if v_version is distinct from new.template_version or not coalesce(v_active,false)
    or v_current is distinct from v_version then
    raise exception 'A versão do modelo é inválida ou não está atual.' using errcode='23514';
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
$$;
create trigger commercial_contract_documents_guard
before insert or update or delete on public.commercial_contract_documents
for each row execute function public.guard_commercial_document_evidence();

alter table public.commercial_contract_documents enable row level security;
revoke all on public.commercial_contract_documents from public,anon,authenticated;
grant select,insert on public.commercial_contract_documents to authenticated;

create policy commercial_documents_read on public.commercial_contract_documents
  for select to authenticated
  using(public.staff_can_module_action('publicidade','contratos_revisar')
        or public.staff_can_see_module('financeiro'));
create policy commercial_documents_insert on public.commercial_contract_documents
  for insert to authenticated
  with check(public.staff_can_module_action('publicidade','contratos_revisar'));

-- O bucket existente permanece privado. Permissões de documentos
-- institucionais NÃO são alteradas. Sem UPDATE/DELETE comerciais.
create policy contract_docs_storage_select_commercial_staff
  on storage.objects for select to authenticated
  using(bucket_id='contract-documents'
    and (storage.foldername(name))[1]='commercial-contracts'
    and (public.staff_can_module_action('publicidade','contratos_revisar')
         or public.staff_can_see_module('financeiro')));
create policy contract_docs_storage_insert_commercial_reviewer
  on storage.objects for insert to authenticated
  with check(bucket_id='contract-documents'
    and (storage.foldername(name))[1]='commercial-contracts'
    and public.staff_can_module_action('publicidade','contratos_revisar')
    and exists(
      select 1 from public.commercial_contract_packages p
      where p.id::text=(storage.foldername(name))[2]
        and p.status='legal_approved'
    ));

comment on table public.commercial_contract_documents is
  'Evidência imutável de PDF comercial, vinculada à venda e ao cliente pelo package_id. Assinatura eletrônica comercial requer integração específica posterior.';
