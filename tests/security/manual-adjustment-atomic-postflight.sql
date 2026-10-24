-- Homologação isolada: tudo dentro de transação com ROLLBACK.
begin;
do $setup$
declare
  admin_id uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  c uuid; r uuid;
begin
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(admin_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'adjust-admin-'||admin_id::text||'@example.invalid',now(),'{"name":"Abatimentos QA"}'::jsonb);
 update public.profiles set role='admin',active=true where id=admin_id;
 insert into public.staff_memberships(profile_id) values(admin_id);
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data)
 values(outsider,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'adjust-external-'||outsider::text||'@example.invalid',now(),'{"name":"Externo QA"}'::jsonb);
 insert into public.clients(kind,full_name) values('individual','Cliente desconto de teste') returning id into c;
 insert into public.receivables(client_id,description,source_type,original_amount,issue_date,due_date)
 values(c,'Título desconto 100','miscellaneous',100,current_date,current_date) returning id into r;
 perform set_config('qa.adj.r',r::text,true);
 perform set_config('qa.adj.admin',admin_id::text,true);
 perform set_config('qa.adj.outsider',outsider::text,true);
end;
$setup$;
set local role authenticated;
do $test$
declare
 rid uuid:=current_setting('qa.adj.r')::uuid;
 op uuid:=gen_random_uuid();
 op2 uuid:=gen_random_uuid();
 first_result record; again record; final_result record;
 n int; total numeric; current_status text;
begin
 perform set_config('request.jwt.claim.sub',current_setting('qa.adj.admin'),true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 begin
   perform * from public.record_manual_receivable_adjustment(
     gen_random_uuid(),rid,30,'settlement_difference','tentativa de escalada',null,null);
   raise exception 'Permitiu quitação com diferença via descontos.';
 exception when sqlstate '22023' then null;
 end;
 begin
   perform * from public.record_manual_receivable_adjustment(
     gen_random_uuid(),rid,101,'discount','valor além do saldo',null,null);
   raise exception 'Permitiu desconto acima do saldo.';
 exception when sqlstate '22023' then null;
 end;
 select * into first_result from public.record_manual_receivable_adjustment(
    op,rid,30,'discount','Desconto negociado',null,'Nota teste');
 if first_result.receivable_balance<>70 or first_result.receivable_status<>'partially_paid'
    or first_result.adjustment_id is null then
    raise exception 'Desconto 30 não resultou em saldo 70 e status parcial.';
 end if;
 select * into again from public.record_manual_receivable_adjustment(
    op,rid,30,'discount','Desconto negociado',null,'Nota teste');
 if again.adjustment_id is distinct from first_result.adjustment_id then
    raise exception 'Retry duplicou ajuste.';
 end if;
 select count(*),sum(amount) into n,total from public.receivable_adjustments where receivable_id=rid;
 if n<>1 or total<>30 then raise exception 'Duplicação de desconto no histórico.'; end if;
 begin
   perform * from public.record_manual_receivable_adjustment(
     op,rid,31,'discount','Desconto negociado',null,'Nota teste');
   raise exception 'Aceitou valor diferente sob mesmo UUID.';
 exception when unique_violation then null;
 end;
 select * into final_result from public.record_manual_receivable_adjustment(
   op2,rid,70,'discount','Desconto final aprovado',null,null);
 if final_result.receivable_status<>'paid' or final_result.receivable_balance<>0 then
   raise exception 'Desconto do saldo restante não quitou o título.';
 end if;
 begin
   insert into public.manual_adjustment_operations(
     operation_id,receivable_id,operation_data,adjustment_id,created_by)
   values(gen_random_uuid(),rid,'{}'::jsonb,first_result.adjustment_id,
     current_setting('qa.adj.admin')::uuid);
   raise exception 'Acesso direto permitiu falsificação de ledger.';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub',current_setting('qa.adj.outsider'),true);
 begin
   perform * from public.record_manual_receivable_adjustment(
     gen_random_uuid(),rid,1,'discount','fraude externa',null,null);
   raise exception 'Usuário sem membership conseguiu desconto.';
 exception when insufficient_privilege then null;
 end;
end;
$test$;
reset role;
rollback;
select 'PASSOU: desconto seguro, idempotente, sem permissões indevidas' as resultado;
