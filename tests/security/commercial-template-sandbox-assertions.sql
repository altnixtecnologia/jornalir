-- Atribuição versionada de modelos, separação do financeiro/institucional.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare p uuid;s0 uuid;s1 uuid; rejected boolean;
begin
 select id into p from public.commercial_contract_packages
 where commercial_sale_id='a1000000-0000-0000-0000-000000000001';
 select id into s0 from public.commercial_contract_services where package_id=p and item_ordinal=0;
 select id into s1 from public.commercial_contract_services where package_id=p and item_ordinal=1;

 insert into public.commercial_contract_template_assignments
 (package_id,service_id,template_id) values
 (p,null,'c0000000-0000-0000-0000-000000000002');

 if (select count(*) from public.commercial_contract_template_assignments where package_id=p)<>1 then
  raise exception 'Modelo combinado não foi preservado.';
 end if;
 rejected:=false;
 begin
  update public.commercial_contract_template_assignments
   set template_id='c0000000-0000-0000-0000-000000000001'
   where package_id=p;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Versão antiga aceitada.'; end if;

 rejected:=false;
 begin
  update public.commercial_contract_template_assignments
   set template_id='c0000000-0000-0000-0000-000000000003'
   where package_id=p;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Modelo institucional aceitado no Comercial.'; end if;

 rejected:=false;
 begin
  update public.commercial_contract_template_assignments
   set template_id='c0000000-0000-0000-0000-000000000007'
   where package_id=p;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Modelo inativo aceitado.'; end if;

 rejected:=false;
 begin
  insert into public.commercial_contract_template_assignments
   (package_id,service_id,template_id) values
   (p,s0,'c0000000-0000-0000-0000-000000000004');
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Modelo individual inserido em pacote combinado.'; end if;

 rejected:=false;
 begin
  update public.commercial_contract_packages set document_mode='separate' where id=p;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Mudou modalidade com modelo combinado ainda vinculado.'; end if;

 -- Remoção intencional permite troca por modelos por serviço.
 delete from public.commercial_contract_template_assignments where package_id=p;
 update public.commercial_contract_packages set document_mode='separate' where id=p;
 insert into public.commercial_contract_template_assignments
 (package_id,service_id,template_id) values
 (p,s0,'c0000000-0000-0000-0000-000000000004'),
 (p,s1,'c0000000-0000-0000-0000-000000000005');
 if (select count(*) from public.commercial_contract_template_assignments where package_id=p)<>2 then
  raise exception 'Dois documentos separados não foram preservados.';
 end if;

 rejected:=false;
 begin
  update public.commercial_contract_template_assignments set
   template_id='c0000000-0000-0000-0000-000000000005'
   where package_id=p and service_id=s0;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Modelo LED vinculado à locação.'; end if;

 rejected:=false;
 begin
  insert into public.commercial_contract_template_assignments
  (package_id,service_id,template_id) values
  (p,s0,'c0000000-0000-0000-0000-000000000004');
 exception when unique_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Duplicou o modelo do mesmo serviço.'; end if;

 update public.commercial_contract_packages set status='pending_legal_review' where id=p;
 rejected:=false;
 begin
  delete from public.commercial_contract_template_assignments where package_id=p;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Modelo removido durante revisão.'; end if;

 rejected:=false;
 begin
  update public.commercial_contract_template_assignments set
   template_id='c0000000-0000-0000-0000-000000000006'
   where package_id=p and service_id=s0;
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Modelo alterado durante revisão.'; end if;

 update public.commercial_contract_packages set status='draft' where id=p;
end;
$test$;

-- Usuário não confirmado nunca pode acessar contratos comerciais.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $test$
begin
 if (select count(*) from public.commercial_contract_template_assignments)<>0 then
  raise exception 'Convite pendente conseguiu ler vínculos jurídicos.';
 end if;
end;
$test$;
reset role;
select 'PASSOU: versões, categorias, modalidade e revisão de modelos comerciais' resultado;
