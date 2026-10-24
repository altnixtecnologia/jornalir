-- Negativas de alteração direta de título e regressão para edição legítima.
begin;
do $setup$
declare
 u uuid:=gen_random_uuid(); c uuid; r uuid; ri uuid;
begin
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'title-admin-'||u::text||'@example.invalid',now(),'{"name":"Título QA"}'::jsonb);
 update public.profiles set role='admin',active=true where id=u;
 insert into public.staff_memberships(profile_id) values(u);
 insert into public.clients(kind,full_name) values('individual','Cliente protegido QA') returning id into c;
 insert into public.receivables(client_id,description,source_type,original_amount,issue_date,due_date)
 values(c,'Título editável','miscellaneous',100,current_date,current_date)
 returning id into r;
 insert into public.receivables(client_id,description,source_type,original_amount,issue_date,due_date)
 values(c,'Título com histórico','miscellaneous',100,current_date,current_date)
 returning id into ri;
 insert into public.receivable_receipts(receivable_id,amount,received_at,payment_method)
 values(ri,20,current_date,'cash');
 perform set_config('qa.titles.actor',u::text,true);
 perform set_config('qa.titles.client',c::text,true);
 perform set_config('qa.titles.r',r::text,true);
 perform set_config('qa.titles.ri',ri::text,true);
end;
$setup$;
set local role authenticated;
do $test$
declare
 id1 uuid:=current_setting('qa.titles.r')::uuid;
 id2 uuid:=current_setting('qa.titles.ri')::uuid;
 c uuid:=current_setting('qa.titles.client')::uuid;
begin
 perform set_config('request.jwt.claim.sub',current_setting('qa.titles.actor'),true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 begin
  update public.receivables set status='paid' where id=id1;
  raise exception 'PATCH direto permitiu forjar título pago.';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.receivables(client_id,description,source_type,original_amount,issue_date,due_date,status)
  values(c,'Título forjado','miscellaneous',50,current_date,current_date,'paid');
  raise exception 'INSERT autenticado permitiu status pago.';
 exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
set local role service_role;
do $test_service$
declare
 id1 uuid:=current_setting('qa.titles.r')::uuid;
 id2 uuid:=current_setting('qa.titles.ri')::uuid;
 count_updated int;
begin
 update public.receivables set notes='Revisão autorizada QA' where id=id1;
 get diagnostics count_updated=row_count;
 if count_updated<>1 then raise exception 'Server role não conseguiu editar observações.'; end if;
 begin
  update public.receivables set original_amount=1 where id=id2;
  raise exception 'Service role reescreveu histórico financeiro.';
 exception when sqlstate '22023' then null; end;
 begin
  update public.receivables set status='cancelled' where id=id2;
  raise exception 'Service role cancelou título com recebimento ativo.';
 exception when sqlstate '22023' then null; end;
end;
$test_service$;
reset role;
rollback;
select 'PASSOU: nenhuma baixa falsa por REST; economico imutavel com histórico' as resultado;
