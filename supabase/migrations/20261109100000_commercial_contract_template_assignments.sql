-- Etapa 2C: modelos jurídicos versionados para contratação comercial.
-- NÃO emite PDFs, NÃO aprova cláusulas automaticamente e NÃO toca
-- no assinador/contratos institucionais.
create table public.commercial_contract_template_assignments (
 id uuid primary key default gen_random_uuid(),
 package_id uuid not null references public.commercial_contract_packages(id) on delete restrict,
 service_id uuid references public.commercial_contract_services(id) on delete restrict,
 template_id uuid not null references public.contract_templates(id) on delete restrict,
 custom_values jsonb not null default '{}'::jsonb check(jsonb_typeof(custom_values)='object'),
 assigned_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index commercial_template_one_combined
 on public.commercial_contract_template_assignments(package_id)
 where service_id is null;
create unique index commercial_template_one_per_service
 on public.commercial_contract_template_assignments(package_id,service_id)
 where service_id is not null;

create or replace function public.validate_commercial_template_assignment()
returns trigger language plpgsql set search_path=''
as $$
declare
 v_pkg record;
 v_service_channel text;
 v_template record;
 v_latest integer;
 v_category text;
begin
 if TG_OP='DELETE' then
   if not public.staff_can_module_action('publicidade','contratos_preparar') then
     raise exception 'Sem permissão para remover vínculo de modelo.' using errcode='42501';
   end if;
   select status into v_pkg from public.commercial_contract_packages
    where id=old.package_id for update;
   if v_pkg.status is distinct from 'draft' then
     raise exception 'Modelo em revisão não pode ser removido.' using errcode='42501';
   end if;
   return old;
 end if;
 if not public.staff_can_module_action('publicidade','contratos_preparar') then
   raise exception 'Sem permissão para atribuir modelos de contrato.' using errcode='42501';
 end if;
 if TG_OP='UPDATE' and (new.package_id is distinct from old.package_id
    or new.service_id is distinct from old.service_id
    or new.assigned_by is distinct from old.assigned_by) then
   raise exception 'Origem do modelo vinculado é imutável.' using errcode='42501';
 end if;
 select id,document_mode,status into v_pkg from public.commercial_contract_packages
  where id=new.package_id for update;
 if v_pkg.id is null or v_pkg.status <> 'draft' then
   raise exception 'Modelos só podem ser atribuídos a uma contratação em rascunho.'
     using errcode='23514';
 end if;
 if v_pkg.document_mode='combined' and new.service_id is not null then
   raise exception 'Documento único precisa de apenas um modelo geral.' using errcode='23514';
 end if;
 if v_pkg.document_mode='separate' and new.service_id is null then
   raise exception 'Documentos individuais exigem modelo por serviço.' using errcode='23514';
 end if;
 if new.service_id is not null then
   select service_channel into v_service_channel from public.commercial_contract_services
    where id=new.service_id and package_id=new.package_id;
   if not found then
     raise exception 'Serviço não pertence a esta venda.' using errcode='23514';
   end if;
 end if;
 select group_id,version,active,category into v_template
 from public.contract_templates where id=new.template_id;
 if v_template.group_id is null or not v_template.active then
   raise exception 'Selecione um modelo ativo.' using errcode='23514';
 end if;
 select max(version) into v_latest from public.contract_templates
 where group_id=v_template.group_id;
 if v_latest <> v_template.version then
   raise exception 'Selecione a versão mais recente do modelo.' using errcode='23514';
 end if;
 v_category:=lower(btrim(coalesce(v_template.category,'')));
 if (v_pkg.document_mode='combined' and v_category<>'commercial_combined')
   or (v_pkg.document_mode='separate'
       and v_category not in ('commercial_generic','commercial_'||lower(v_service_channel))) then
   raise exception 'Modelo jurídico incompatível com a modalidade do serviço.'
     using errcode='23514';
 end if;
 if jsonb_typeof(new.custom_values)<>'object' or
   pg_catalog.octet_length(new.custom_values::text)>16000 then
   raise exception 'Variáveis do modelo inválidas ou extensas demais.' using errcode='23514';
 end if;
 return new;
end;
$$;
create trigger commercial_template_assignments_validate
before insert or update or delete on public.commercial_contract_template_assignments
for each row execute function public.validate_commercial_template_assignment();

-- Não alterar o tipo de documentação enquanto houver vínculo de modelo.
create or replace function public.enforce_commercial_package_mode_locked()
returns trigger language plpgsql set search_path=''
as $$
begin
 if new.document_mode is distinct from old.document_mode
   and exists (select 1 from public.commercial_contract_template_assignments
               where package_id=old.id) then
   raise exception 'Retire os vínculos de modelos antes de alterar documento único/separado.'
     using errcode='23514';
 end if;
 return new;
end;
$$;
create trigger commercial_package_mode_with_template_guard
before update on public.commercial_contract_packages
for each row execute function public.enforce_commercial_package_mode_locked();

alter table public.commercial_contract_template_assignments enable row level security;
revoke all on public.commercial_contract_template_assignments from anon;
grant select,insert,update,delete on public.commercial_contract_template_assignments to authenticated;
create policy commercial_template_bindings_read on public.commercial_contract_template_assignments
 for select to authenticated
 using(public.staff_can_module_action('publicidade','contratos_preparar')
    or public.staff_can_module_action('publicidade','contratos_revisar'));
create policy commercial_template_bindings_insert on public.commercial_contract_template_assignments
 for insert to authenticated
 with check(public.staff_can_module_action('publicidade','contratos_preparar'));
create policy commercial_template_bindings_update on public.commercial_contract_template_assignments
 for update to authenticated
 using(public.staff_can_module_action('publicidade','contratos_preparar'))
 with check(public.staff_can_module_action('publicidade','contratos_preparar'));
create policy commercial_template_bindings_delete on public.commercial_contract_template_assignments
 for delete to authenticated
 using(public.staff_can_module_action('publicidade','contratos_preparar'));

comment on table public.commercial_contract_template_assignments is
 'Vínculo explicitamente escolhido para modelo comercial versionado; não constitui aprovação jurídica nem emissão.';
