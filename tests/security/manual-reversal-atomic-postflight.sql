-- Testes sem dados reais: transação abortada ao fim.
begin;
do $setup$
declare
 u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 c uuid; r1 uuid; r2 uuid; receipt1 uuid; receipt2 uuid;
 adj1 uuid; credit1 uuid; credit_adj uuid;
begin
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values (u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'reversal-admin-'||u::text||'@example.invalid',now(),'{"name":"Estorno QA"}'::jsonb);
 update public.profiles set role='admin',active=true where id=u;
 insert into public.staff_memberships(profile_id) values(u);
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values (outsider,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'reversal-outsider-'||outsider::text||'@example.invalid',now(),'{"name":"Externo QA"}'::jsonb);
 insert into public.clients(kind,full_name) values('individual','Cliente Estorno QA') returning id into c;
 insert into public.receivables(client_id,description,source_type,original_amount,issue_date,due_date)
 values(c,'Estorno validado','miscellaneous',100,current_date,current_date) returning id into r1;
 insert into public.receivables(client_id,description,source_type,original_amount,issue_date,due_date)
 values(c,'Estorno protegido crédito','miscellaneous',100,current_date,current_date) returning id into r2;
 insert into public.receivable_receipts(receivable_id,amount,received_at,payment_method)
 values(r1,30,current_date,'cash') returning id into receipt1;
 insert into public.receivable_receipts(receivable_id,amount,received_at,payment_method)
 values(r2,30,current_date,'cash') returning id into receipt2;
 insert into public.receivable_adjustments(receivable_id,amount,adjustment_type,reason)
 values(r1,20,'discount','Desconto teste') returning id into adj1;
 insert into public.client_credits(client_id,source_type,origin_receivable_id,origin_receipt_id,original_amount,reason)
 values(c,'miscellaneous',r2,receipt2,10,'Crédito do pagamento protegido') returning id into credit1;
 insert into public.client_credits(client_id,source_type,origin_receivable_id,original_amount,reason)
 values(c,'miscellaneous',r2,25,'Crédito para aplicação') returning id into credit_adj;
 insert into public.receivable_adjustments(receivable_id,amount,adjustment_type,reason,credit_id)
 values(r1,10,'credit_applied','Aplicação QA',credit_adj);
 perform set_config('qa.rev.actor',u::text,true);
 perform set_config('qa.rev.stranger',outsider::text,true);
 perform set_config('qa.rev.r1',r1::text,true);
 perform set_config('qa.rev.r2',r2::text,true);
 perform set_config('qa.rev.receipt1',receipt1::text,true);
 perform set_config('qa.rev.receipt2',receipt2::text,true);
 perform set_config('qa.rev.adj1',adj1::text,true);
end;
$setup$;
set local role authenticated;
do $test$
declare
 r1 uuid:=current_setting('qa.rev.r1')::uuid;
 r2 uuid:=current_setting('qa.rev.r2')::uuid;
 rec1 uuid:=current_setting('qa.rev.receipt1')::uuid;
 rec2 uuid:=current_setting('qa.rev.receipt2')::uuid;
 adj_id uuid:=current_setting('qa.rev.adj1')::uuid;
 a record; b record; n int; bal numeric;
begin
 perform set_config('request.jwt.claim.sub',current_setting('qa.rev.actor'),true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 begin
  perform * from public.reverse_receivable_receipt_safe(r1,rec2,'Outro título');
  raise exception 'Estorno de recibo cruzado aceito.';
 exception when sqlstate '22023' then null; end;
 begin
  perform * from public.reverse_receivable_receipt_safe(r2,rec2,'Crédito ativo');
  raise exception 'Recibo com crédito foi estornado.';
 exception when sqlstate '22023' then null; end;
 begin
  update public.receivable_receipts set reversed_at=now() where id=rec1;
  raise exception 'PATCH direto de recibo foi aceito.';
 exception when insufficient_privilege then null; end;
 begin
  update public.receivable_adjustments set reversed_at=now() where id=adj_id;
  raise exception 'PATCH direto de abatimento foi aceito.';
 exception when insufficient_privilege then null; end;
 select * into a from public.reverse_receivable_receipt_safe(r1,rec1,'Erro de lançamento');
 if a.receivable_status<>'partially_paid' or a.balance<>70 or a.already_reversed then
   raise exception 'Estorno do recibo calculou saldo/status incorretos.';
 end if;
 select * into b from public.reverse_receivable_receipt_safe(r1,rec1,'Erro de lançamento');
 if b.item_id is distinct from a.item_id or not b.already_reversed then
   raise exception 'Retry do estorno não reconheceu histórico.';
 end if;
 select count(*) into n from public.receivable_receipts where id=rec1 and reversed_at is not null;
 if n<>1 then raise exception 'Estorno não persistiu no histórico.'; end if;
 select * into a from public.reverse_receivable_adjustment_safe(r1,adj_id,'Desconto indevido');
 if a.balance<>90 or a.receivable_status<>'partially_paid' then
  raise exception 'Estorno de desconto não recompôs saldo.';
 end if;
 begin
  perform set_config('request.jwt.claim.sub',current_setting('qa.rev.stranger'),true);
  perform * from public.reverse_receivable_receipt_safe(r1,rec1,'Erro de lançamento');
  raise exception 'Externo teve permissão para estorno.';
 exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
rollback;
select 'PASSOU: estornos com vinculacao, idempotencia e sem PATCH direto' as resultado;
