-- Integração completa em banco temporário. ROLLBACK: nenhum cadastro persistido.
begin;
do $fixture$
declare
 actor uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
 client_id uuid; s1 uuid; s2 uuid;
 r1 uuid; r2 uuid; target_id uuid; other_id uuid;
begin
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'comp-admin-'||actor::text||'@example.invalid',now(),'{"name":"Operador Composição"}'::jsonb);
 update public.profiles set role='admin',active=true where id=actor;
 insert into public.staff_memberships(profile_id) values(actor);
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(stranger,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'comp-external-'||stranger::text||'@example.invalid',now(),'{"name":"Externo"}'::jsonb);
 insert into public.clients(kind,full_name) values('individual','Cliente Composição QA') returning id into client_id;
 insert into public.subscriptions(client_id,service_type,amount)
 values(client_id,'digital',100) returning id into s1;
 insert into public.subscriptions(client_id,service_type,amount)
 values(client_id,'impresso',100) returning id into s2;
 insert into public.receivables(client_id,description,source_type,subscription_id,original_amount,issue_date,due_date)
 values(client_id,'Anterior 1','subscription',s1,30,current_date-10,current_date-7) returning id into r1;
 insert into public.receivables(client_id,description,source_type,subscription_id,original_amount,issue_date,due_date)
 values(client_id,'Anterior 2','subscription',s1,50,current_date-10,current_date-5) returning id into r2;
 insert into public.receivables(client_id,description,source_type,subscription_id,original_amount,issue_date,due_date)
 values(client_id,'Título atual','subscription',s1,20,current_date-10,current_date) returning id into target_id;
 insert into public.receivables(client_id,description,source_type,subscription_id,original_amount,issue_date,due_date)
 values(client_id,'Outra assinatura','subscription',s2,40,current_date-10,current_date) returning id into other_id;
 perform set_config('qa.comp.actor',actor::text,true);
 perform set_config('qa.comp.stranger',stranger::text,true);
 perform set_config('qa.comp.r1',r1::text,true);
 perform set_config('qa.comp.r2',r2::text,true);
 perform set_config('qa.comp.target',target_id::text,true);
 perform set_config('qa.comp.other',other_id::text,true);
end;
$fixture$;

set local role authenticated;
do $test$
declare
 r1 uuid:=current_setting('qa.comp.r1')::uuid;
 r2 uuid:=current_setting('qa.comp.r2')::uuid;
 dest uuid:=current_setting('qa.comp.target')::uuid;
 other_id uuid:=current_setting('qa.comp.other')::uuid;
 op uuid:=gen_random_uuid();
 first_run record; retried record;
 cnt integer; amt numeric; active_status text;
 ids uuid[];
begin
 perform set_config('request.jwt.claim.sub',current_setting('qa.comp.actor'),true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 ids:=array[r1,r2,dest];

 -- Sem crédito se pagar 80: prova da distribuição por ordem de vencimento.
 -- Antes disso, rejeitar lista incompleta, ordem invertida e origem cruzada.
 begin
   perform * from public.record_manual_composition_payment(
     gen_random_uuid(),array[r2,r1,dest],80,current_date,'cash','qa','teste',null);
   raise exception 'Permitiu pagar fora da ordem de vencimento.';
 exception when sqlstate '22023' then null;
 end;
 begin
   perform * from public.record_manual_composition_payment(
     gen_random_uuid(),array[r1,dest],80,current_date,'cash','qa','teste',null);
   raise exception 'Permitiu pular título anterior.';
 exception when sqlstate '22023' then null;
 end;
 begin
   perform * from public.record_manual_composition_payment(
     gen_random_uuid(),array[r1,r2,other_id],80,current_date,'cash','qa','teste',null);
   raise exception 'Permitiu misturar assinaturas distintas.';
 exception when sqlstate '22023' then null;
 end;

 -- O único pagamento de R$ 120 quita 30+50+20 e gera crédito 20.
 select * into first_run from public.record_manual_composition_payment(
   op,ids,120,current_date,'cash','qa-cmp','teste',null);
 if first_run.applied_amount<>100 or first_run.credit_amount<>20
   or first_run.credit_id is null or jsonb_array_length(first_run.allocations)<>3 then
   raise exception 'Distribuição incorreta (30+50+20) ou crédito excedente não criado.';
 end if;
 select * into retried from public.record_manual_composition_payment(
   op,ids,120,current_date,'cash','qa-cmp','teste',null);
 if retried.allocations is distinct from first_run.allocations
   or retried.credit_id is distinct from first_run.credit_id then
   raise exception 'Retry duplicou ou alterou recibos/crédito.';
 end if;
 select count(*),sum(amount) into cnt,amt from public.receivable_receipts
   where receivable_id=any(ids);
 if cnt<>3 or amt<>100 then raise exception 'Recibos duplicados ou soma incorreta.'; end if;
 select count(*) into cnt from public.client_credits where id=first_run.credit_id;
 if cnt<>1 then raise exception 'Crédito de excedente ausente ou duplicado.'; end if;
 select count(*) into cnt from public.receivables
   where id=any(ids) and status='paid';
 if cnt<>3 then raise exception 'Composição não quitou os três títulos.'; end if;
 begin
   perform * from public.record_manual_composition_payment(
     op,ids,121,current_date,'cash','qa-cmp','teste',null);
   raise exception 'Aceitou reuse do UUID com valor diferente.';
 exception when unique_violation then null;
 end;
 begin
   insert into public.manual_composition_operations(
     operation_id,receivable_ids,operation_data,applied_amount,credit_amount,created_by)
   values(gen_random_uuid(),ids,'{}'::jsonb,1,0,current_setting('qa.comp.actor')::uuid);
   raise exception 'Permitiu escrita direta no ledger.';
 exception when insufficient_privilege then null;
 end;

 -- Signatário externo sem membership nunca pode registrar pagamento.
 perform set_config('request.jwt.claim.sub',current_setting('qa.comp.stranger'),true);
 begin
   perform * from public.record_manual_composition_payment(
     gen_random_uuid(),ids,10,current_date,'cash','qa','teste',null);
   raise exception 'Conta externa conseguiu registrar pagamento.';
 exception when insufficient_privilege then null;
 end;
end;
$test$;
reset role;
rollback;
select 'PASSOU: composição, origem, permissão, retry e crédito em transação única' as resultado;
