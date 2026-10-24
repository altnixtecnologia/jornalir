-- Asserts isolados, rollback integral, nunca executar no Supabase remoto.
begin;
do $setup$
declare u uuid:=gen_random_uuid(); c uuid; r uuid; s uuid;
begin
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'atomic-finance-'||u::text||'@example.invalid',now(),
  '{"name":"Operador QA","account_purpose":"staff_invite"}'::jsonb);
 update public.profiles set role='admin',active=true where id=u;
 insert into public.staff_memberships(profile_id) values(u);
 insert into public.clients(kind,full_name) values('individual','Cliente fictício do teste financeiro') returning id into c;
 insert into public.receivables(
  client_id,description,source_type,original_amount,issue_date,due_date
 ) values(c,'Recebimento com excedente','miscellaneous',100,current_date,current_date)
 returning id into r;
 insert into public.receivables(
  client_id,description,source_type,original_amount,issue_date,due_date
 ) values(c,'Quitação com diferença','miscellaneous',100,current_date,current_date)
 returning id into s;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('qa.manual.r',r::text,true);
 perform set_config('qa.manual.s',s::text,true);
end;
$setup$;

set local role authenticated;
do $test$
declare
 r uuid:=current_setting('qa.manual.r')::uuid;
 s uuid:=current_setting('qa.manual.s')::uuid;
 op1 uuid:=gen_random_uuid();
 op2 uuid:=gen_random_uuid();
 first_payment record;
 retry_payment record;
 settlement record;
 n integer;
 current_status text;
begin
 select * into first_payment
 from public.record_manual_receivable_payment(
 op1,r,120,current_date,'cash','QA-REC','Ensaio transacional',null,
 'receipt',null,null);
 if first_payment.applied_amount<>100 or first_payment.credit_amount<>20
  or first_payment.receipt_id is null or first_payment.credit_id is null then
  raise exception 'Pagamento 120 em título 100 não gerou recibo 100 + crédito 20.';
 end if;
 select * into retry_payment from public.record_manual_receivable_payment(
 op1,r,120,current_date,'cash','QA-REC','Ensaio transacional',null,
 'receipt',null,null);
 if retry_payment.receipt_id is distinct from first_payment.receipt_id
  or retry_payment.credit_id is distinct from first_payment.credit_id then
  raise exception 'Retry criou novo recibo ou novo crédito.';
 end if;
 select count(*) into n from public.receivable_receipts where receivable_id=r;
 if n<>1 then raise exception 'Recibo duplicado após retry.'; end if;
 select count(*) into n from public.client_credits where origin_receivable_id=r;
 if n<>1 then raise exception 'Crédito duplicado após retry.'; end if;
 select status into current_status from public.receivables where id=r;
 if current_status<>'paid' then raise exception 'Status do título não foi quitado.'; end if;
 begin
  perform * from public.record_manual_receivable_payment(
   op1,r,130,current_date,'cash','QA-REC','Ensaio transacional',null,
   'receipt',null,null);
  raise exception 'A mesma operação foi aceita com valor alterado.';
 exception when unique_violation then null;
 end;

 select * into settlement from public.record_manual_receivable_payment(
 op2,s,70,current_date,'cash','QA-SET','Ensaio da diferença',null,
 'settlement','Diferença negociada e autorizada',null);
 if settlement.receipt_id is null or settlement.adjustment_id is null
  or settlement.applied_amount<>70 or settlement.credit_id is not null then
  raise exception 'Quitação com diferença não preservou recibo/abatimento.';
 end if;
 select count(*) into n from public.receivable_adjustments
  where receivable_id=s and adjustment_type='settlement_difference' and amount=30;
 if n<>1 then raise exception 'Abatimento de 30 não foi registrado.'; end if;
 select status into current_status from public.receivables where id=s;
 if current_status<>'paid' then raise exception 'Título com diferença não quitado.'; end if;
end;
$test$;
reset role;
rollback;
select 'PASSOU: recibo idempotente, excedente em crédito e quitação atômica' as resultado;
