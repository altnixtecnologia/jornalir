-- Escolha automática de modelos a partir do canal contratado.
-- Não aprova cláusulas, não publica PDF e nunca encaminha para assinatura.
-- Fallback genérico só ocorre para serviço individual SEM modelo específico.
-- Catálogo ambíguo ou inexistente permanece pendente para conferência.
create or replace function public.assign_commercial_contract_default_templates(p_package_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare
  v_pkg record;
  v_service record;
  v_category text;
  v_template uuid;
  v_count integer;
  v_added integer := 0;
begin
  if not public.staff_can_module_action('publicidade','contratos_preparar') then
    raise exception 'Sem permissão para preparar contratos.' using errcode='42501';
  end if;
  select id,document_mode,status into v_pkg
    from public.commercial_contract_packages where id=p_package_id for update;
  if v_pkg.id is null or v_pkg.status <> 'draft' then
    raise exception 'Só é possível escolher modelos de rascunhos.' using errcode='23514';
  end if;

  for v_service in
    select s.id, s.service_channel
    from public.commercial_contract_services s
    where s.package_id=p_package_id
    order by s.item_ordinal
  loop
    if v_pkg.document_mode='combined' then
      if exists(select 1 from public.commercial_contract_template_assignments
                where package_id=p_package_id and service_id is null) then
        return v_added; -- respeitar escolha anterior do operador
      end if;
      v_category:='commercial_combined';
    else
      if exists(select 1 from public.commercial_contract_template_assignments
                where package_id=p_package_id and service_id=v_service.id) then
        continue; -- não sobrescrever ajustes ou modelo escolhido
      end if;
      v_category:='commercial_'||lower(btrim(coalesce(v_service.service_channel,'')));
    end if;

    select count(*), min(t.id::text)::uuid into v_count,v_template
      from public.contract_templates t
      where t.active=true and lower(btrim(coalesce(t.category,'')))=v_category
        and not exists(select 1 from public.contract_templates newer
          where newer.group_id=t.group_id and newer.version>t.version);

    if v_count=0 and v_pkg.document_mode='separate' then
      -- Não misturar modalidades: usar genérico somente se não houver
      -- NENHUM específico disponível, e houver UM genérico inequívoco.
      select count(*), min(t.id::text)::uuid into v_count,v_template
        from public.contract_templates t
        where t.active=true and lower(btrim(coalesce(t.category,'')))='commercial_generic'
          and not exists(select 1 from public.contract_templates newer
            where newer.group_id=t.group_id and newer.version>t.version);
    end if;
    if v_count=1 then
      insert into public.commercial_contract_template_assignments(
        package_id,service_id,template_id,custom_values,assigned_by
      ) values(
        p_package_id,
        case when v_pkg.document_mode='combined' then null else v_service.id end,
        v_template,'{}'::jsonb,auth.uid()
      ) on conflict do nothing;
      if found then v_added:=v_added+1; end if;
    end if;
    if v_pkg.document_mode='combined' then return v_added; end if;
  end loop;
  return v_added;
end;
$$;
revoke all on function public.assign_commercial_contract_default_templates(uuid) from public,anon;
grant execute on function public.assign_commercial_contract_default_templates(uuid) to authenticated;

-- Mantém o RPC antigo, o contrato único por venda e a imutabilidade
-- da proposta. Novo comportamento: escolher automaticamente a versão
-- atual compatível quando existe uma opção inequívoca.
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
   raise exception 'Somente vendas aprovadas/ativas podem originar contratos.' using errcode='23514';
 end if;
 insert into public.commercial_contract_packages(
   commercial_sale_id,client_id,document_mode,created_by
 ) values(p_sale_id,v_sale.client_id,p_document_mode,auth.uid())
 on conflict(commercial_sale_id) do nothing returning id into v_id;

 if v_id is null then
  select id into v_id from public.commercial_contract_packages
   where commercial_sale_id=p_sale_id;
  -- Chamada repetida preserva a modalidade já escolhida; só completa
  -- modelos pendentes, nunca duplica documento nem reseta dados.
  if (select status from public.commercial_contract_packages where id=v_id)='draft' then
    perform public.assign_commercial_contract_default_templates(v_id);
  end if;
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
   insert into public.commercial_contract_services(
     package_id,item_ordinal,source_snapshot,service_channel,service_title
   ) values(
     v_id,0,
     pg_catalog.jsonb_build_object(
       'origin','single_sale',
       'productId',v_sale.product_id,
       'description',v_sale.description,
       'serviceChannel',v_sale.channel,
       'totalAmount',v_sale.amount,'quantity',1
     ),
     v_sale.channel,coalesce(nullif(v_sale.description,''),'Venda avulsa')
   );
 end if;
 perform public.assign_commercial_contract_default_templates(v_id);
 return v_id;
end;
$$;
revoke all on function public.prepare_commercial_contract(uuid,text) from public,anon;
grant execute on function public.prepare_commercial_contract(uuid,text) to authenticated;

-- Alternância de contrato único/individual em transação: remove somente
-- vínculos do rascunho (não documentos assinados), altera a modalidade
-- e recalcula os modelos corretos para cada serviço.
create or replace function public.set_commercial_contract_document_mode(
 p_package_id uuid,p_mode text
) returns integer language plpgsql security definer set search_path=''
as $$
declare v_old text;
begin
 if not public.staff_can_module_action('publicidade','contratos_preparar') then
   raise exception 'Sem permissão para preparar contratos.' using errcode='42501';
 end if;
 if p_mode not in ('combined','separate') then
   raise exception 'Modalidade inválida.' using errcode='23514';
 end if;
 select document_mode into v_old from public.commercial_contract_packages
   where id=p_package_id and status='draft' for update;
 if not found then
   raise exception 'Contratação não encontrada ou já encaminhada à revisão.' using errcode='23514';
 end if;
 if v_old is distinct from p_mode then
   delete from public.commercial_contract_template_assignments
      where package_id=p_package_id;
   update public.commercial_contract_packages set
     document_mode=p_mode,updated_at=now() where id=p_package_id;
 end if;
 return public.assign_commercial_contract_default_templates(p_package_id);
end;
$$;
revoke all on function public.set_commercial_contract_document_mode(uuid,text) from public,anon;
grant execute on function public.set_commercial_contract_document_mode(uuid,text) to authenticated;

comment on function public.assign_commercial_contract_default_templates(uuid) is
 'Sugere automaticamente modelo ativo da ultima versao pelo serviço, sem substituir escolha humana; ambiguidades ficam pendentes.';
