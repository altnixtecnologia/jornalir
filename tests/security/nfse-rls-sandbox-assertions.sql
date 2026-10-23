-- NFS-e: operador com rascunhos_criar NÃO tem emitir, cancelar nem certificado.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $tests$
declare affected int; rejected boolean;
begin
 if not public.staff_can_module_action('nfse','rascunhos_criar')
  or public.staff_can_module_action('nfse','notas_emitir')
  or public.staff_can_module_action('nfse','configuracoes_gerenciar') then
  raise exception 'Matriz fiscal inicial incorreta.';
 end if;
 insert into public.nfse_drafts(id,status,service_value)
  values('90000000-0000-0000-0000-000000000003','draft',300);
 rejected:=false;
 begin
  insert into public.nfse_drafts(id,status,service_value)
   values('90000000-0000-0000-0000-000000000004','authorized',400);
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Operador criou nota autorizada sem emissão.'; end if;

 affected:=0;
 begin
  update public.nfse_drafts set service_value=25
  where id='90000000-0000-0000-0000-000000000003';
  get diagnostics affected=row_count;
 exception when others then affected:=0;
 end;
 if affected<>0 then raise exception 'Criador editou nota sem permissão.'; end if;

 affected:=0;
 begin
  insert into public.nfse_issued_notes(id,draft_id,service_value)
    values('90000000-0000-0000-0000-000000000005',
       '90000000-0000-0000-0000-000000000003',300);
  affected:=1;
 exception when others then affected:=0;
 end;
 if affected<>0 then raise exception 'Operador emitiu NFS-e sem autorização.'; end if;

 if (select count(*) from public.nfse_issued_notes)<>1 then
  raise exception 'A leitura da nota emitida deve ser possível a quem acessa o módulo.';
 end if;
 if (select count(*) from public.nfse_certificates)<>0 then
  raise exception 'Certificado privado exposto pela API.';
 end if;
end;
$tests$;

-- Editar rascunhos não permite transmitir ou mudar a origem.
reset role;
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed)
 values('00000000-0000-0000-0000-000000000002','nfse','rascunhos_editar',true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
update public.nfse_drafts set service_value=330
 where id='90000000-0000-0000-0000-000000000003';
do $tests$
declare rejected boolean;
begin
 rejected:=false;
 begin
  update public.nfse_drafts set status='transmitted'
  where id='90000000-0000-0000-0000-000000000003';
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Editar rascunho permitiu transmitir.'; end if;

 rejected:=false;
 begin
  update public.nfse_drafts set commercial_sale_id='50000000-0000-0000-0000-000000000001'
  where id='90000000-0000-0000-0000-000000000003';
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Operador alterou origem da nota.'; end if;
end;
$tests$;

-- Permissão para gerenciar configuração permite perfil, mas não certificados.
reset role;
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed)
 values('00000000-0000-0000-0000-000000000002','nfse','configuracoes_gerenciar',true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
insert into public.nfse_service_profiles(id,name)
 values('90000000-0000-0000-0000-000000000006','Perfil fictício');
insert into public.nfse_issuer_configs(id,company_name)
 values('90000000-0000-0000-0000-000000000007','Empresa exemplo');
do $tests$
begin
 if (select count(*) from public.nfse_certificates)<>0 then
  raise exception 'Configuração fiscal expôs dados do certificado.';
 end if;
end;
$tests$;

-- Cancelamento e emissão continuam reservados a administrador/proprietário.
reset role;
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed)
values('00000000-0000-0000-0000-000000000002','nfse','notas_cancelar',true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $tests$
declare rejected boolean;
begin
 rejected:=false;
 begin
   insert into public.nfse_cancellation_requests(id,issued_note_id,status)
    values('90000000-0000-0000-0000-000000000008',
       '90000000-0000-0000-0000-000000000001','pending');
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Cancelamento fiscal delegado sem homologação.'; end if;
end;
$tests$;

reset role;
update public.staff_module_visibility set enabled=false
 where profile_id='00000000-0000-0000-0000-000000000002' and module_key='nfse';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $tests$
begin
 if (select count(*) from public.nfse_drafts)<>0 or
    (select count(*) from public.nfse_issued_notes)<>0 then
  raise exception 'Módulo fiscal oculto continua legível.';
 end if;
end;
$tests$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $tests$
begin
 if (select count(*) from public.nfse_issued_notes)<>1 or
    not public.is_active_admin_or_owner() then
    raise exception 'Administrador não consegue consultar as notas.';
 end if;
end;
$tests$;
reset role;
select 'PASSOU: rascunhos delegados; fiscal/certificado protegidos' resultado;
