-- PostgreSQL isolado, após as fixtures de venda com N serviços e locação.
-- Nenhum contrato jurídico ou PDF é emitido neste teste.
reset role;
update public.staff_module_visibility
 set enabled=true where profile_id='00000000-0000-0000-0000-000000000002' and module_key='publicidade';
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed)
values ('00000000-0000-0000-0000-000000000002','publicidade','contratos_preparar',true);

-- Operador sem permissão de revisão pode preparar mas não encaminhar.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare
 v_id uuid; v_second uuid; v_count integer; rejected boolean;
begin
 v_id:=public.prepare_commercial_contract('a1000000-0000-0000-0000-000000000001','combined');
 v_second:=public.prepare_commercial_contract('a1000000-0000-0000-0000-000000000001','separate');
 if v_id is distinct from v_second then
  raise exception 'Mesma venda criou contratos paralelos duplicados.';
 end if;
 select count(*) into v_count from public.commercial_contract_services where package_id=v_id;
 if v_count<>2 then raise exception 'Contrato combinado perdeu itens originais.'; end if;
 if (select count(*) from public.commercial_contract_packages where commercial_sale_id=
  'a1000000-0000-0000-0000-000000000001')<>1 then
   raise exception 'Mais de um cabeçalho para venda.';
 end if;
 rejected:=false;
 begin
  update public.commercial_contract_packages set status='pending_legal_review'
   where id=v_id;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Operador preparador aprovou revisão indevidamente.'; end if;

 rejected:=false;
 begin
  update public.commercial_contract_services
   set source_snapshot='{"totalAmount":0}'::jsonb
   where package_id=v_id and item_ordinal=0;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Snapshot original da venda reescrito.'; end if;
 
 -- Datas e objeto devem ser conferidos INDIVIDUALMENTE.
 update public.commercial_contract_services
  set starts_on='2026-11-05', ends_on='2026-11-30',
    service_location='Praça central', service_scope='Exibição LED conforme proposta'
  where package_id=v_id and item_ordinal=1;
 update public.commercial_contract_services
  set starts_on='2026-11-02', ends_on='2026-11-30',
    service_scope='Locação de projetor e acessórios acordados',service_location='Redação IR'
  where package_id=v_id and item_ordinal=0;
end;
$test$;

-- Mesmo sem permissão de preparação, a revisão só avança se os
-- requisitos de TODOS os itens estiverem completos.
reset role;
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed)
values ('00000000-0000-0000-0000-000000000002','publicidade','contratos_revisar',true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare v_pkg uuid; rejected boolean;
begin
 select id into v_pkg from public.commercial_contract_packages
  where commercial_sale_id='a1000000-0000-0000-0000-000000000001';
 update public.commercial_contract_packages set status='pending_legal_review'
  where id=v_pkg;
 if (select status from public.commercial_contract_packages where id=v_pkg)
  <> 'pending_legal_review' then
   raise exception 'Pacote completo não passou à revisão.';
 end if;

 rejected:=false;
 begin
  update public.commercial_contract_services
  set service_scope='Alteração posterior'
  where package_id=v_pkg and item_ordinal=0;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Termos mudaram durante revisão jurídica.'; end if;

 rejected:=false;
 begin
  update public.commercial_contract_packages
   set document_mode='separate' where id=v_pkg;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Agrupamento mudou após revisão iniciada.'; end if;

 update public.commercial_contract_packages set status='draft' where id=v_pkg;
 if (select status from public.commercial_contract_packages where id=v_pkg)<>'draft' then
   raise exception 'Revisor não conseguiu devolver o documento para ajustes.';
 end if;
end;
$test$;

-- Uma segunda venda aprovada pode optar por documentos separados, sem
-- emitir contrato automaticamente.
reset role;
insert into public.commercial_sales(id,client_id,status,amount,description,channel)
values('a1000000-0000-0000-0000-000000000099',
 '40000000-0000-0000-0000-000000000001','approved',450,
 'Serviço avulso', 'newspaper');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare v_pkg uuid; rejected boolean;
begin
 v_pkg:=public.prepare_commercial_contract('a1000000-0000-0000-0000-000000000099','separate');
 if (select document_mode from public.commercial_contract_packages where id=v_pkg)<>'separate'
  or (select count(*) from public.commercial_contract_services where package_id=v_pkg)<>1 then
   raise exception 'Venda avulsa não foi preservada.';
 end if;

 rejected:=false;
 begin
  update public.commercial_contract_packages set status='pending_legal_review'
  where id=v_pkg;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Contrato sem prazos/objeto foi enviado para assinatura.'; end if;
end;
$test$;

-- Sem visibilidade no Comercial não há permissão para preparar documento.
reset role;
update public.staff_module_visibility set enabled=false
 where profile_id='00000000-0000-0000-0000-000000000002' and module_key in ('publicidade','financeiro');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare rejected boolean:=false;
begin
 begin
  perform public.prepare_commercial_contract('a1000000-0000-0000-0000-000000000099','combined');
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Módulo oculto permitiu preparação.'; end if;
 if (select count(*) from public.commercial_contract_packages)<>0 then
  raise exception 'Módulo oculto permitiu ler contratos comerciais.';
 end if;
end;
$test$;
reset role;
select 'PASSOU: contrato combinado/separado, origem, prazos e direitos' as resultado;
