-- Regressões que precisam falhar mesmo com acesso direto ao PostgREST.
-- Começamos pela pessoa que recebeu convite e não confirmou o e-mail.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $test$
begin
 if public.staff_can_module_action('clientes','clientes_editar') then
   raise exception 'Convite pendente recebeu acesso de edição.';
 end if;
 if (select count(*) from public.clients)<>0 then
   raise exception 'Convite pendente conseguiu ler clientes.';
 end if;
end;
$test$;

-- Operador com apenas permissão de CRIAR nas áreas.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare
  affected int;
  rejected boolean;
begin
 if not public.staff_can_module_action('clientes','clientes_criar')
   or public.staff_can_module_action('clientes','clientes_editar') then
   raise exception 'Matriz de Clientes incorreta.';
 end if;

 insert into public.clients(id,kind,full_name) values
  ('40000000-0000-0000-0000-000000000002','person','Cliente cadastrado pelo operador');

 update public.clients set full_name='Alterado sem editar'
  where id='40000000-0000-0000-0000-000000000002';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Criador editou cliente sem permissão.'; end if;

 -- RPC SECURITY DEFINER precisa negar mesmo quando RLS seria burlada.
 rejected:=false;
 begin
  perform public.save_client('40000000-0000-0000-0000-000000000002',
    '{"kind":"person","full_name":"Alteração indevida"}'::jsonb,array[]::text[]);
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'RPC permitiu edição sem autorização.'; end if;

 insert into public.subscriptions(id,client_id,service_type,status,amount) values
  ('60000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000002','impresso','active',120);
 update public.subscriptions set amount=15
   where id='60000000-0000-0000-0000-000000000001';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Criador alterou valor de assinatura.'; end if;

 update public.subscriptions set status='cancelled'
   where id='60000000-0000-0000-0000-000000000001';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Criador cancelou assinatura.'; end if;

 insert into public.commercial_proposals(id,client_id,status) values
  ('50000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000002','draft');
 insert into public.commercial_proposal_items(id,proposal_id,description,quantity,unit_price) values
  ('51000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000002','Painel LED',1,300);

 update public.commercial_proposals set status='approved'
  where id='50000000-0000-0000-0000-000000000002';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Criador aprovou proposta sem direito.'; end if;
end;
$test$;

-- Aprovar proposta NÃO libera edição dos itens ou do cliente.
reset role;
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed)
 values('00000000-0000-0000-0000-000000000002','publicidade','propostas_aprovar',true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare
 affected int;
 rejected boolean;
begin
 update public.commercial_proposals set status='approved'
 where id='50000000-0000-0000-0000-000000000002';
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Operador autorizado não conseguiu aprovar.'; end if;

 affected:=0;
 begin
  update public.commercial_proposals set notes='Alteração sem direito'
   where id='50000000-0000-0000-0000-000000000002';
  get diagnostics affected=row_count;
 exception when others then affected:=0;
 end;
 if affected<>0 then raise exception 'Aprovação permitiu modificar dados da proposta.'; end if;

 rejected:=false;
 begin
  insert into public.commercial_proposal_items(id,proposal_id,description,quantity,unit_price)
  values('51000000-0000-0000-0000-000000000002',
         '50000000-0000-0000-0000-000000000002','Novo item depois de aprovado',1,99);
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Item inserido após aprovação.'; end if;

 -- Após aprovação, conversão pode gravar venda sem liberar edição genérica.
 insert into public.commercial_sales(id,client_id,status,amount,proposal_id) values
  ('70000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000002','approved',300,
   '50000000-0000-0000-0000-000000000002');
 affected:=0;
 begin
  update public.commercial_sales set amount=1 where id='70000000-0000-0000-0000-000000000001';
  get diagnostics affected=row_count;
 exception when others then affected:=0;
 end;
 if affected<>0 then raise exception 'Converter também permitiu editar valor da venda.'; end if;
end;
$test$;

-- Conceder cancelar venda SEM conceder editar valores.
reset role;
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed)
 values('00000000-0000-0000-0000-000000000002','publicidade','vendas_cancelar',true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare
 affected int;
begin
 update public.commercial_sales set status='cancelled'
 where id='70000000-0000-0000-0000-000000000001';
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Direito de cancelar não funcionou.'; end if;
 affected:=0;
 begin
  update public.commercial_sales set amount=0
   where id='70000000-0000-0000-0000-000000000001';
  get diagnostics affected=row_count;
 exception when others then affected:=0;
 end;
 if affected<>0 then raise exception 'Direito de cancelar alterou preço.'; end if;
end;
$test$;

-- Ocultar os módulos corta acesso a leitura e ações, preservando grants.
reset role;
update public.staff_module_visibility set enabled=false
 where profile_id='00000000-0000-0000-0000-000000000002' and module_key in ('clientes','assinaturas','publicidade');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
begin
 if (select count(*) from public.clients)<>0
   or (select count(*) from public.subscriptions)<>0
   or (select count(*) from public.commercial_sales)<>0
   or public.staff_can_module_action('clientes','clientes_criar')
   or public.staff_can_module_action('publicidade','vendas_cancelar') then
   raise exception 'Módulo oculto ainda permite acesso.';
 end if;
end;
$test$;

-- Proprietário sempre integral, independentemente das caixas dos operadores.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $test$
begin
 if not public.staff_can_module_action('clientes','clientes_editar')
   or not public.staff_can_module_action('publicidade','propostas_aprovar')
   or (select count(*) from public.clients)<2 then
   raise exception 'Regressão de acesso do proprietário.';
 end if;
end;
$test$;
reset role;
select 'PASSOU: ACL de Clientes + Assinaturas + Comercial + convite' as resultado;
