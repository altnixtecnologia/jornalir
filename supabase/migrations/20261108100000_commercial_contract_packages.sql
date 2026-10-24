-- Preparação do instrumento de contratação comercial, SEM EMISSÃO jurídica.
-- Depende de commercial_sales.items_snapshot e de staff_can_module_action.
-- Não altera contratos institucionais, assinatura eletrônica nem cobranças.
create table public.commercial_contract_packages (
 id uuid primary key default gen_random_uuid(),
 commercial_sale_id uuid not null unique
   references public.commercial_sales(id) on delete restrict,
 client_id uuid not null references public.clients(id) on delete restrict,
 document_mode text not null check (document_mode in ('combined','separate')),
 status text not null default 'draft'
   check (status in ('draft','pending_legal_review')),
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.commercial_contract_services (
 id uuid primary key default gen_random_uuid(),
 package_id uuid not null references public.commercial_contract_packages(id)
   on delete restrict,
 item_ordinal integer not null check (item_ordinal>=0),
 source_snapshot jsonb not null check (jsonb_typeof(source_snapshot)='object'),
 service_channel text not null,
 service_title text not null check(length(btrim(service_title))>0),
 starts_on date,
 ends_on date,
 service_location text,
 service_scope text,
 execution_conditions text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(package_id,item_ordinal),
 constraint commercial_contract_service_dates check (
   ends_on is null or starts_on is null or ends_on>=starts_on
 )
);
create index commercial_contract_services_pkg_idx
  on public.commercial_contract_services(package_id,item_ordinal);

-- O vínculo de cliente e venda pertence ao cadastro central, nunca ao
-- formulário do contrato. O status jurídico real será implementado em
-- etapa posterior, vinculado a documento assinado e seus hashes.
create or replace function public.enforce_commercial_contract_package()
returns trigger language plpgsql set search_path=''
as $$
declare v_sale record;
begin
 select client_id,status into v_sale from public.commercial_sales where id=new.commercial_sale_id;
 if not found or v_sale.status not in ('approved','active') then
   raise exception 'Contrato comercial exige venda aprovada/ativa.' using errcode='23514';
 end if;
 if new.client_id is distinct from v_sale.client_id then
   raise exception 'Cliente do contrato deve ser o mesmo da venda.' using errcode='23514';
 end if;
 if TG_OP='UPDATE' then
  if new.commercial_sale_id is distinct from old.commercial_sale_id
     or new.client_id is distinct from old.client_id
     or new.created_by is distinct from old.created_by then
   raise exception 'Origem e cliente da contratação são imutáveis.' using errcode='42501';
  end if;
  if old.status='pending_legal_review' and (
     new.document_mode is distinct from old.document_mode
     or new.status='draft'
  ) and not public.staff_can_module_action('publicidade','contratos_revisar') then
   raise exception 'Somente o revisor pode devolver a contratação para ajustes.' using errcode='42501';
  end if;
  if new.status='pending_legal_review' and old.status='draft' then
   if not public.staff_can_module_action('publicidade','contratos_revisar') then
    raise exception 'Sem autorização para encaminhar à revisão jurídica.' using errcode='42501';
   end if;
   if exists(
    select 1 from public.commercial_contract_services i
    where i.package_id=new.id
      and (i.starts_on is null or i.ends_on is null
       or nullif(btrim(coalesce(i.service_scope,'')),'') is null
       or (i.service_channel in ('led_panel','equipment_rental')
         and nullif(btrim(coalesce(i.service_location,'')),'') is null))
   ) or not exists(select 1 from public.commercial_contract_services i where i.package_id=new.id) then
     raise exception 'Preencha início, término, objeto e local obrigatório de cada serviço.'
       using errcode='23514';
   end if;
  end if;
  if old.status='pending_legal_review' and new.status='pending_legal_review'
     and new.document_mode is distinct from old.document_mode then
   raise exception 'Devolva para ajustes antes de mudar o agrupamento.' using errcode='42501';
  end if;
 end if;
 return new;
end;
$$;

-- O snapshot econômico não pode ser reescrito para simular preço novo ou
-- prazo já aceito. Ajustes de preço exigem nova venda/aditivo.
create or replace function public.enforce_commercial_contract_service()
returns trigger language plpgsql set search_path=''
as $$
declare v_status text;
begin
 if TG_OP='DELETE' then
   raise exception 'Itens de contratação possuem histórico imutável.' using errcode='42501';
 end if;
 select status into v_status from public.commercial_contract_packages
 where id=new.package_id for update;
 if v_status is distinct from 'draft' then
   raise exception 'Somente rascunhos podem receber ajustes.' using errcode='42501';
 end if;
 if TG_OP='UPDATE' and (
   new.package_id is distinct from old.package_id or
   new.item_ordinal is distinct from old.item_ordinal or
   new.source_snapshot is distinct from old.source_snapshot or
   new.service_channel is distinct from old.service_channel or
   new.service_title is distinct from old.service_title
 ) then
   raise exception 'A origem/valores contratados não podem ser reescritos.' using errcode='42501';
 end if;
 return new;
end;
$$;

create trigger commercial_contract_packages_guard before insert or update
on public.commercial_contract_packages for each row
execute function public.enforce_commercial_contract_package();
create trigger commercial_contract_services_guard before insert or update or delete
on public.commercial_contract_services for each row
execute function public.enforce_commercial_contract_service();

-- Inserção do cabeçalho e de TODOS os itens na mesma transação:
-- contrato combinado ou separados usam os MESMOS itens da venda.
create or replace function public.prepare_commercial_contract(
  p_sale_id uuid,p_document_mode text default 'combined'
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_sale public.commercial_sales%rowtype;
 v_id uuid;
 v_item jsonb;
 v_ord bigint;
begin
 if not public.staff_can_module_action('publicidade','contratos_preparar') then
   raise exception 'Sem permissão para preparar contratos comerciais.' using errcode='42501';
 end if;
 if p_document_mode not in ('combined','separate') then
   raise exception 'Escolha contrato único ou separado.' using errcode='23514';
 end if;
 select * into v_sale from public.commercial_sales where id=p_sale_id for update;
 if not found or v_sale.status not in ('approved','active') then
   raise exception 'Somente vendas aprovadas/ativas podem originar contratos.'
     using errcode='23514';
 end if;
 insert into public.commercial_contract_packages(
   commercial_sale_id,client_id,document_mode,created_by
 ) values(p_sale_id,v_sale.client_id,p_document_mode,(select auth.uid()))
 on conflict(commercial_sale_id) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from public.commercial_contract_packages
   where commercial_sale_id=p_sale_id;
  return v_id;
 end if;

 if v_sale.items_snapshot is not null then
   for v_item,v_ord in select value,ordinality
   from pg_catalog.jsonb_array_elements(v_sale.items_snapshot) with ordinality loop
     insert into public.commercial_contract_services(
       package_id,item_ordinal,source_snapshot,service_channel,service_title
     ) values(
       v_id,(v_ord-1)::integer,v_item,
       coalesce(nullif(v_item->>'serviceChannel',''),'other'),
       coalesce(nullif(v_item->>'productName',''),nullif(v_item->>'description',''),'Serviço sem nome')
     );
   end loop;
 else
   -- Venda avulsa/antiga sem snapshot de proposta:
   -- espelha somente a condição HISTÓRICA que já consta na venda.
   insert into public.commercial_contract_services(
     package_id,item_ordinal,source_snapshot,service_channel,service_title
   ) values(
     v_id,0,
     pg_catalog.jsonb_build_object(
       'origin','single_sale',
       'productId',v_sale.product_id,
       'description',v_sale.description,
       'serviceChannel',v_sale.channel,
       'totalAmount',v_sale.amount,
       'quantity',1
     ),
     v_sale.channel, coalesce(nullif(v_sale.description,''),'Venda avulsa')
   );
 end if;
 return v_id;
end;
$$;

revoke all on function public.prepare_commercial_contract(uuid,text) from public,anon;
grant execute on function public.prepare_commercial_contract(uuid,text) to authenticated;

alter table public.commercial_contract_packages enable row level security;
alter table public.commercial_contract_services enable row level security;
revoke all on public.commercial_contract_packages,public.commercial_contract_services from anon;
grant select,update on public.commercial_contract_packages to authenticated;
grant select,update on public.commercial_contract_services to authenticated;

create policy commercial_contract_packages_read on public.commercial_contract_packages
for select to authenticated
using (public.staff_can_see_module('publicidade') or public.staff_can_see_module('financeiro'));
create policy commercial_contract_packages_edit on public.commercial_contract_packages
for update to authenticated
using (public.staff_can_module_action('publicidade','contratos_preparar')
       or public.staff_can_module_action('publicidade','contratos_revisar'))
with check (public.staff_can_module_action('publicidade','contratos_preparar')
       or public.staff_can_module_action('publicidade','contratos_revisar'));

create policy commercial_contract_services_read on public.commercial_contract_services
for select to authenticated
using (exists(select 1 from public.commercial_contract_packages p
 where p.id=package_id and (public.staff_can_see_module('publicidade')
   or public.staff_can_see_module('financeiro'))));
create policy commercial_contract_services_edit on public.commercial_contract_services
for update to authenticated
using (public.staff_can_module_action('publicidade','contratos_preparar'))
with check(public.staff_can_module_action('publicidade','contratos_preparar'));

comment on table public.commercial_contract_packages is
 'Preparação de documentos comerciais agrupados ou separados; não equivale a contrato emitido/assinado.';
comment on table public.commercial_contract_services is
 'Prazos e obrigações por serviço sem alterar o histórico econômico da venda.';
