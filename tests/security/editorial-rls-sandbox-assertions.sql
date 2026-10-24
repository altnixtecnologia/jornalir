-- Gatilhos, RLS e permissões EXECUTE sem qualquer conexão à produção.
-- As funções protegidas não podem ser chamadas via anon (API pública).
do $test$
begin
 if has_function_privilege('anon','public.publish_due_scheduled_articles()','EXECUTE')
    or has_function_privilege('anon','public.convert_import_candidate_to_draft(uuid,text,text,text,uuid,uuid,integer,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.legacy_import_article(jsonb,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.create_pdf_import_batch(uuid,text,text,integer,integer[],jsonb,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.merge_import_candidates(uuid,uuid[],text,uuid[])','EXECUTE')
    or has_function_privilege('anon','public.split_import_candidate(uuid,text,text,text)','EXECUTE')
    or has_function_privilege('anon','public.reserve_next_dps_number(uuid,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.publish_due_scheduled_articles()','EXECUTE')
    or has_function_privilege('authenticated','public.sync_site_offer_settings_to_commercial_products()','EXECUTE')
 then raise exception 'RPC interna permaneceu exposta.'; end if;
end;
$test$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $test$
declare rejected boolean;
begin
 if public.staff_can_module_action('editorial','materias_criar') then
   raise exception 'Convite não confirmado tem permissão editorial.';
 end if;
 if (select count(*) from public.articles)<>0 then
   raise exception 'Convite pode ler artigos internos.';
 end if;
 rejected:=false;
 begin
  perform public.legacy_import_article('{}'::jsonb,'{}'::jsonb);
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Convite chamou importador privilegiado.'; end if;
end;
$test$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare rejected boolean; affected integer;
begin
 if not public.staff_can_module_action('editorial','materias_criar') or
    public.staff_can_module_action('editorial','materias_publicar') then
    raise exception 'Permissão editorial inicial incorreta.';
 end if;
 insert into public.articles(id,slug,title,status)
 values('80000000-0000-0000-0000-000000000001','minuta','Matéria em rascunho','draft');

 rejected:=false;
 begin
  insert into public.articles(id,slug,title,status)
   values('80000000-0000-0000-0000-000000000002','publicacao','Matéria direta','published');
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Criador publicou sem direito.'; end if;

 rejected:=false;
 begin
  insert into public.articles(id,slug,title,status,urgent)
   values('80000000-0000-0000-0000-000000000003','urgencia','Alerta direto','draft',true);
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Criador criou alerta urgente.'; end if;

 affected:=0;
 begin
  update public.articles set status='published'
  where id='80000000-0000-0000-0000-000000000001';
  get diagnostics affected=row_count;
 exception when others then affected:=0;
 end;
 if affected<>0 then raise exception 'Criador publicou por UPDATE.'; end if;

 affected:=0;
 begin
  update public.articles set title='Editado indevidamente'
  where id='80000000-0000-0000-0000-000000000001';
  get diagnostics affected=row_count;
 exception when others then affected:=0;
 end;
 if affected<>0 then raise exception 'Criador alterou matéria sem direito.'; end if;

 insert into public.birthday_entries(id,display_name,birth_month,birth_day)
 values('81000000-0000-0000-0000-000000000001','Pessoa fictícia',10,23);
 rejected:=false;
 begin
  insert into public.birthday_edition_messages(id,birthday_entry_id,message)
  values('82000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001','Mensagem não autorizada');
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Gerente de aniversariantes também gerou mensagem.'; end if;

 rejected:=false;
 begin
  insert into public.birthday_message_templates(id,body)
  values('83000000-0000-0000-0000-000000000001','Modelo sem autorização');
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Cadastro de aniversariantes gerenciou modelos.'; end if;

 -- Chamadas SECURITY DEFINER precisam verificar a ação, mesmo se RLS
 -- de artigos estiver correta.
 rejected:=false;
 begin
  perform public.merge_import_candidates(null,'{}'::uuid[],null,'{}'::uuid[]);
 exception when others then rejected:=true;
 end;
 if not rejected then raise exception 'Criador usou merge sem edição.'; end if;
end;
$test$;

-- Autorização de publicar não concede editar texto; editar não concede alertas.
reset role;
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed) values
 ('00000000-0000-0000-0000-000000000002','editorial','materias_publicar',true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
declare affected integer;
begin
 update public.articles set status='published'
 where id='80000000-0000-0000-0000-000000000001';
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Publicação autorizada falhou.'; end if;
 affected:=0;
 begin
  update public.articles set title='Mudança indevida'
  where id='80000000-0000-0000-0000-000000000001';
  get diagnostics affected=row_count;
 exception when others then affected:=0;
 end;
 if affected<>0 then raise exception 'Publicar concedeu edição de texto.'; end if;
end;
$test$;

reset role;
insert into public.staff_module_action_permissions(profile_id,module_key,action_key,allowed) values
 ('00000000-0000-0000-0000-000000000002','aniversariantes','mensagens_gerenciar',true);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
insert into public.birthday_message_templates(id,body)
values('83000000-0000-0000-0000-000000000002','Modelo permitido');
insert into public.birthday_edition_messages(id,birthday_entry_id,message)
values('82000000-0000-0000-0000-000000000002',
 '81000000-0000-0000-0000-000000000001','Mensagem autorizada');

reset role;
update public.staff_module_visibility set enabled=false
 where profile_id='00000000-0000-0000-0000-000000000002'
 and module_key in ('editorial','aniversariantes');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $test$
begin
 if public.staff_can_module_action('editorial','materias_publicar')
  or (select count(*) from public.articles)<>0
  or (select count(*) from public.birthday_entries)<>0 then
    raise exception 'Módulo oculto ainda permite consultar dados internos.';
 end if;
end;
$test$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $test$
begin
 if not public.staff_can_module_action('editorial','materias_publicar')
   or not public.staff_can_module_action('aniversariantes','mensagens_gerenciar')
   or (select count(*) from public.articles)<>1 then
     raise exception 'Proprietário perdeu acesso editorial/aniversariantes.';
 end if;
end;
$test$;
reset role;
select 'PASSOU: Editorial, Aniversariantes, RPC e cron protegidos' as resultado;
