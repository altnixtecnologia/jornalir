-- Módulo 10: permissões da lista de clientes digitais. Supabase descartável.
-- Nunca usa clientes reais nem envia dados ao Altnix Informativo.
begin;
do $seed$
declare
  v_admin uuid:=gen_random_uuid();
  v_operator uuid:=gen_random_uuid();
  v_external uuid:=gen_random_uuid();
  v_client uuid;
begin
  insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
  values
  (v_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'digital-admin-'||v_admin||'@example.invalid',now(),'{"name":"Admin Digital"}'::jsonb),
  (v_operator,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'digital-op-'||v_operator||'@example.invalid',now(),'{"name":"Operador Digital"}'::jsonb),
  (v_external,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'digital-external-'||v_external||'@example.invalid',now(),'{"name":"Externo Digital"}'::jsonb);
  update public.profiles set role='admin',active=true where id=v_admin;
  update public.profiles set role='operator',active=true where id in (v_operator,v_external);
  insert into public.staff_memberships(profile_id) values(v_admin),(v_operator);
  insert into public.clients(kind,status,full_name)
  values('individual','active','Cliente Digital de Homologação')
  returning id into v_client;
  perform set_config('qa.digital.admin',v_admin::text,true);
  perform set_config('qa.digital.operator',v_operator::text,true);
  perform set_config('qa.digital.external',v_external::text,true);
  perform set_config('qa.digital.client',v_client::text,true);
end;
$seed$;

set local role authenticated;
do $tests$
declare
  v_client uuid:=current_setting('qa.digital.client')::uuid;
  n integer;
  denied boolean;
begin
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',current_setting('qa.digital.operator'),true);
  if public.is_active_admin_or_owner() then
    raise exception 'Operador recebeu acesso administrativo.';
  end if;
  denied:=false;
  begin
    perform public.set_client_digital_export_permission(v_client,true);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Operador liberou dados digitais.'; end if;

  perform set_config('request.jwt.claim.sub',current_setting('qa.digital.external'),true);
  denied:=false;
  begin
    perform public.set_client_digital_export_permission(v_client,true);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Conta sem membership conseguiu liberar exportação.'; end if;

  perform set_config('request.jwt.claim.sub',current_setting('qa.digital.admin'),true);
  if not public.set_client_digital_export_permission(v_client,true) then
    raise exception 'Administrador não conseguiu liberar cliente.';
  end if;
  select count(*) into n from public.client_digital_export_permissions
  where client_id=v_client and enabled=true and enabled_by=current_setting('qa.digital.admin')::uuid;
  if n<>1 then raise exception 'Autorização não foi gravada com o autor.'; end if;
  -- Repetir a mesma operação não deve duplicar a permissão.
  perform public.set_client_digital_export_permission(v_client,true);
  select count(*) into n from public.client_digital_export_permissions
  where client_id=v_client;
  if n<>1 then raise exception 'Retry duplicou a permissão.'; end if;

  perform set_config('request.jwt.claim.sub',current_setting('qa.digital.operator'),true);
  select count(*) into n from public.client_digital_export_permissions
  where client_id=v_client;
  if n<>0 then raise exception 'Operador leu permissão administrativa por PostgREST.'; end if;
  denied:=false;
  begin
    insert into public.client_digital_export_permissions(client_id,enabled)
    values(gen_random_uuid(),true);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Operador gravou permissão diretamente.'; end if;

  perform set_config('request.jwt.claim.sub',current_setting('qa.digital.admin'),true);
  if not public.set_client_digital_export_permission(v_client,false) then
    raise exception 'Administrador não conseguiu revogar compartilhamento.';
  end if;
  select count(*) into n from public.client_digital_export_permissions
  where client_id=v_client and enabled;
  if n<>0 then raise exception 'Revogação não bloqueou exportação.'; end if;
end;
$tests$;
reset role;

-- Cadastros inativos não podem receber liberação nova.
update public.clients set status='inactive'
where id=current_setting('qa.digital.client')::uuid;
set local role authenticated;
do $inactive$
declare denied boolean:=false;
begin
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',current_setting('qa.digital.admin'),true);
  begin
    perform public.set_client_digital_export_permission(
      current_setting('qa.digital.client')::uuid,true);
  exception when invalid_parameter_value then denied:=true;
  end;
  if not denied then raise exception 'Cadastro inativo recebeu exportação.'; end if;
end;
$inactive$;
reset role;
rollback;
select 'PASSOU: exportação digital somente após aprovação admin, RLS, retry e revogação' as resultado;
