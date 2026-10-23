-- Após importar a migration de seleção automática (PostgreSQL descartável).
reset role;
update public.staff_module_visibility set enabled=true
 where profile_id='00000000-0000-0000-0000-000000000002'
   and module_key='publicidade';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $check$
declare
  v_new uuid;
  v_repeated uuid;
  v_one integer;
  v_count integer;
  v_id uuid;
  v_sale uuid := 'a1000000-0000-0000-0000-000000000101';
begin
  -- Proposta com duas modalidades: locação e LED.
  insert into public.commercial_sales(id,client_id,status,amount,items_snapshot)
    values(v_sale,'40000000-0000-0000-0000-000000000001','approved',475,
      '[{"productName":"Projetor","serviceChannel":"equipment_rental","totalAmount":200,"quantity":1},
        {"productName":"LED","serviceChannel":"led_panel","totalAmount":275,"quantity":1}]'::jsonb);
  -- A venda aprovada cria seu rascunho automaticamente.
  select id into v_new from public.commercial_contract_packages where commercial_sale_id=v_sale;
  if v_new is null then raise exception 'Aprovação da venda não criou rascunho automático'; end if;
  -- A preparação posterior é idempotente e completa modelos faltantes.
  if public.prepare_commercial_contract(v_sale,'combined') <> v_new then
    raise exception 'Preparação posterior duplicou a venda.';
  end if;
  if (select document_mode from public.commercial_contract_packages where id=v_new) <> 'combined' then
     raise exception 'Contrato único não foi criado';
  end if;
  select count(*) into v_count
    from public.commercial_contract_template_assignments
    where package_id=v_new and service_id is null
      and template_id='c0000000-0000-0000-0000-000000000002';
  if v_count<>1 then raise exception 'Não selecionou automaticamente a última versão do modelo combinado'; end if;
  v_repeated:=public.prepare_commercial_contract(v_sale,'separate');
  if v_repeated<>v_new or
    (select count(*) from public.commercial_contract_template_assignments where package_id=v_new)<>1
   then raise exception 'Idempotência falhou ou substituiu escolha já criada'; end if;
  v_one:=public.set_commercial_contract_document_mode(v_new,'separate');
  if v_one<>2 then raise exception 'Deveria vincular automaticamente dois modelos por modalidade'; end if;
  if (select count(*) from public.commercial_contract_template_assignments a
     join public.commercial_contract_services s on s.id=a.service_id
     where a.package_id=v_new and (
       (s.service_channel='equipment_rental' and a.template_id='c0000000-0000-0000-0000-000000000004')
       or (s.service_channel='led_panel' and a.template_id='c0000000-0000-0000-0000-000000000005')
     ))<>2 then
     raise exception 'Modelo do serviço não corresponde à modalidade contratada';
  end if;

  -- Escolha manual não pode ser reescrita pelo cálculo automático.
  select a.id into v_id from public.commercial_contract_template_assignments a
    join public.commercial_contract_services s on s.id=a.service_id
    where a.package_id=v_new and s.service_channel='led_panel';
  update public.commercial_contract_template_assignments
    set template_id='c0000000-0000-0000-0000-000000000006' where id=v_id;
  perform public.assign_commercial_contract_default_templates(v_new);
  if (select template_id from public.commercial_contract_template_assignments where id=v_id)
     <> 'c0000000-0000-0000-0000-000000000006'::uuid then
    raise exception 'Seleção humana foi sobrescrita';
  end if;

  -- Alternar de volta deve recomputar somente um modelo do pacote.
  perform public.set_commercial_contract_document_mode(v_new,'combined');
  if (select count(*) from public.commercial_contract_template_assignments
       where package_id=v_new and service_id is null)<>1
     or (select count(*) from public.commercial_contract_template_assignments
         where package_id=v_new)<>1 then
    raise exception 'Troca de modalidade deixou duplicidade de modelos';
  end if;
end;
$check$;

-- Nenhum modelo ativo compatível: ficar pendente, sem inventar contrato.
reset role;
update public.contract_templates set active=false
 where category in ('commercial_combined','commercial_generic');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $check$
declare p uuid;
begin
 insert into public.commercial_sales(id,client_id,status,amount,description,channel)
 values('a1000000-0000-0000-0000-000000000102',
        '40000000-0000-0000-0000-000000000001','approved',80,'Serviço sem modelo','unknown');
 select id into p from public.commercial_contract_packages
   where commercial_sale_id='a1000000-0000-0000-0000-000000000102';
 if p is null then raise exception 'Venda sem modelo não gerou seu rascunho'; end if;
 perform public.prepare_commercial_contract('a1000000-0000-0000-0000-000000000102','combined');
 if exists(select 1 from public.commercial_contract_template_assignments where package_id=p) then
   raise exception 'Contrato criado com modelo não elegível';
 end if;
end;
$check$;
reset role;
select 'PASSOU: escolha automática, versões, multissserviços e revisão manual' resultado;
