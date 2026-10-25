-- Crédito, aplicação e bloqueios de escrita direta, banco de teste descartável.
begin;
do $setup$
declare
 u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 c uuid; r1 uuid; r2 uuid; rec uuid; origin_credit uuid; apply_credit uuid;
begin
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'credit-admin-'||u::text||'@example.invalid',now(),'{"name":"Crédito QA"}'::jsonb);
 update public.profiles set role='admin',active=true where id=u;
 insert into public.staff_memberships(profile_id) values(u);
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(outsider,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'credit-outsider-'||outsider::text||'@example.invalid',now(),'{"name":"Externo QA"}'::jsonb);
 insert into public.clients(kind,full_name) values('individual','Cliente Crédito QA') returning id into c;
 insert into public.receivables(client_id,description,source_type,original_amount,issue_date,due_date)
 values(c,'Recebimento com crédito excedente','miscellaneous',100,current_date,current_date) returning id into r1;
 insert into public.receivables(client_id,description,source_type,original_amount,issue_date,due_date)
 values(c,'Aplicação de crédito','miscellaneous',100,current_date,current_date) returning id into r2;
 insert into public.receivable_receipts(receivable_id,amount,received_at,payment_method)
 values(r1,30,current_date,'cash') returning id into rec;
 insert into public.client_credits(client_id,source_type,origin_receivable_id,origin_receipt_id,original_amount,reason)
 values(c,'miscellaneous',r1,rec,40,'Excedente manual QA') returning id into origin_credit;
 insert into public.client_credits(client_id,source_type,origin_receivable_id,original_amount,reason)
 values(c,'miscellaneous',r1,50,'Saldo avulso QA') returning id into apply_credit;
 perform set_config('qa.credit.actor',u::text,true);
 perform set_config('qa.credit.outsider',outsider::text,true);
 perform set_config('qa.credit.r1',r1::text,true);
 perform set_config('qa.credit.r2',r2::text,true);
 perform set_config('qa.credit.rec',rec::text,true);
 perform set_config('qa.credit.origin',origin_credit::text,true);
 perform set_config('qa.credit.apply',apply_credit::text,true);
end;
$setup$;
set local role authenticated;
do $test$
declare
 actor uuid:=current_setting('qa.credit.actor')::uuid;
 r1 uuid:=current_setting('qa.credit.r1')::uuid;
 r2 uuid:=current_setting('qa.credit.r2')::uuid;
 rec uuid:=current_setting('qa.credit.rec')::uuid;
 from_receipt uuid:=current_setting('qa.credit.origin')::uuid;
 applied_credit uuid:=current_setting('qa.credit.apply')::uuid;
 app record; result record; adj_id uuid; n int;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 begin
  insert into public.receivable_receipts(receivable_id,amount,received_at) values(r1,1,current_date);
  raise exception 'INSERT direto de recibo permitido.';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.receivable_adjustments(receivable_id,amount,adjustment_type,reason)
  values(r2,1,'discount','forjado');
  raise exception 'INSERT direto de abatimento permitido.';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.client_credits(client_id,source_type,original_amount) values(
   (select client_id from public.receivables where id=r1),'miscellaneous',100);
  raise exception 'INSERT direto de crédito permitido.';
 exception when insufficient_privilege then null; end;
 select * into app from public.apply_client_credit(
  applied_credit,r2,20,'Aplicação controlada de teste',null);
 if app.applied_amount<>20 or app.credit_remaining<>30 or app.receivable_balance<>80 then
  raise exception 'Aplicação de crédito retornou saldo incorreto.';
 end if;
 begin
  perform * from public.reverse_client_credit_safe(applied_credit,'Desfazer');
  raise exception 'Estorno de crédito já aplicado foi permitido.';
 exception when sqlstate '22023' then null; end;
 select id into adj_id from public.receivable_adjustments
 where credit_id=applied_credit and receivable_id=r2 and reversed_at is null;
 if adj_id is null then raise exception 'Aplicação sem histórico.'; end if;
 perform * from public.reverse_receivable_adjustment_safe(r2,adj_id,'Desfazer aplicação QA');
 select * into result from public.reverse_client_credit_safe(applied_credit,'Crédito não utilizado QA');
 if result.credit_id is distinct from applied_credit or result.already_reversed then
  raise exception 'Crédito com aplicações estornadas não pôde ser revertido.';
 end if;
 begin
  perform * from public.reverse_receivable_receipt_safe(r1,rec,'Reembolso QA');
  raise exception 'Estorno de recibo com crédito ativo foi permitido.';
 exception when sqlstate '22023' then null; end;
 perform * from public.reverse_client_credit_safe(from_receipt,'Crédito excedente reembolsado');
 perform * from public.reverse_receivable_receipt_safe(r1,rec,'Reembolso QA');
 select count(*) into n from public.receivable_receipts where id=rec and reversed_at is not null;
 if n<>1 then raise exception 'Recibo não foi estornado após crédito reembolsado.'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('qa.credit.outsider'),true);
 begin
  perform * from public.apply_client_credit(applied_credit,r2,1,'Fraude',null);
  raise exception 'Externo aplicou crédito indevidamente.';
 exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
rollback;
select 'PASSOU: ledger sem escritas diretas, crédito aplicado e reversões coordenadas' as resultado;
