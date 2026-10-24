-- Recebimento manual/quitação com diferença transacional e idempotente.
-- A chave permanece igual nos retries do formulário; sem comunicação externa.
create table public.manual_receivable_operations (
 operation_id uuid primary key,
 receivable_id uuid not null references public.receivables(id) on delete restrict,
 operation_type text not null check(operation_type in ('receipt','settlement')),
 operation_data jsonb not null,
 receipt_id uuid references public.receivable_receipts(id) on delete restrict,
 adjustment_id uuid references public.receivable_adjustments(id) on delete restrict,
 credit_id uuid references public.client_credits(id) on delete restrict,
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);
alter table public.manual_receivable_operations enable row level security;
revoke all on public.manual_receivable_operations from public,anon,authenticated;
grant select,insert on public.manual_receivable_operations to authenticated;
grant select,insert,update on public.manual_receivable_operations to service_role;
create policy manual_receivable_operations_read on public.manual_receivable_operations
 for select to authenticated using (
 public.staff_can_see_module('financeiro') and
 (created_by=(select auth.uid()) or public.is_active_admin_or_owner()));
create policy manual_receivable_operations_insert on public.manual_receivable_operations
 for insert to authenticated with check (created_by=(select auth.uid()) and
 ((operation_type='receipt' and public.staff_can_finance_action('recebimentos_baixar'))
 or (operation_type='settlement' and public.staff_can_finance_action('recebimentos_quitar_diferenca'))));

create function public.record_manual_receivable_payment(
 p_operation_id uuid,p_receivable_id uuid,p_amount numeric,p_received_at date,
 p_payment_method text,p_reference text,p_notes text,p_received_by uuid,
 p_mode text,p_reason text,p_authorized_by uuid
)
returns table(receipt_id uuid,adjustment_id uuid,credit_id uuid,applied_amount numeric,credit_amount numeric)
language plpgsql set search_path=public as $fn$
declare
 t public.receivables;
 previous public.manual_receivable_operations;
 snapshot jsonb;
 received numeric; adjusted numeric; balance_before numeric;
 applied numeric; extra numeric; discount numeric; new_balance numeric;
 rid uuid; aid uuid; cid uuid; next_status text;
begin
 if p_operation_id is null or p_receivable_id is null or p_received_at is null
  or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
  or p_amount>9999999999.99 or p_mode is null or p_mode not in ('receipt','settlement')
 then raise exception 'Dados do recebimento inválidos.' using errcode='22023'; end if;
 if not case when p_mode='receipt'
   then public.staff_can_finance_action('recebimentos_baixar')
   else public.staff_can_finance_action('recebimentos_quitar_diferenca') end
 then raise exception 'Sem permissão para receber.' using errcode='42501'; end if;
 if p_mode='settlement' and nullif(btrim(coalesce(p_reason,'')),'') is null
 then raise exception 'Motivo da diferença é obrigatório.' using errcode='22023'; end if;
 snapshot:=jsonb_build_object(
 'id',p_receivable_id,'amount',p_amount,'date',p_received_at,
 'method',p_payment_method,'reference',p_reference,'notes',p_notes,
 'received_by',p_received_by,'mode',p_mode,'reason',p_reason,
 'authorized_by',p_authorized_by,'actor',(select auth.uid()));
 -- Banco serializa pagamentos e retries no título (mesmo lock da baixa Pix).
 select * into t from public.receivables where id=p_receivable_id for update;
 if t.id is null then raise exception 'Título não encontrado.'; end if;
 select * into previous from public.manual_receivable_operations where operation_id=p_operation_id;
 if found then
  if previous.operation_data is distinct from snapshot
   or previous.receivable_id is distinct from p_receivable_id
   or previous.operation_type is distinct from p_mode
  then raise exception 'ID já usado em outra operação. Reabra o formulário.' using errcode='23505'; end if;
  return query select previous.receipt_id,previous.adjustment_id,previous.credit_id,
   coalesce((select amount from public.receivable_receipts where id=previous.receipt_id),0),
   coalesce((select original_amount from public.client_credits where id=previous.credit_id),0);
  return;
 end if;
 if t.status='cancelled' then raise exception 'Título cancelado não permite recebimento.'; end if;
 select coalesce(sum(amount),0) into received from public.receivable_receipts
  where receivable_id=p_receivable_id and reversed_at is null;
 select coalesce(sum(amount),0) into adjusted from public.receivable_adjustments
  where receivable_id=p_receivable_id and reversed_at is null;
 balance_before:=t.original_amount-received-adjusted;
 applied:=least(p_amount,greatest(balance_before,0));
 extra:=p_amount-applied; discount:=0;
 if p_mode='settlement' then
  if balance_before<=0 or p_amount>=balance_before
   then raise exception 'Quitação com diferença exige pagamento menor que saldo positivo.'; end if;
  extra:=0; discount:=balance_before-p_amount;
 end if;
 if applied>0 then
  insert into public.receivable_receipts
   (receivable_id,amount,received_at,payment_method,reference,notes,received_by)
  values (p_receivable_id,applied,p_received_at,p_payment_method,p_reference,p_notes,p_received_by)
  returning id into rid;
 end if;
 if discount>0 then
  insert into public.receivable_adjustments
   (receivable_id,amount,adjustment_type,reason,authorized_by)
  values (p_receivable_id,discount,'settlement_difference',btrim(p_reason),p_authorized_by)
  returning id into aid;
 end if;
 if extra>0 then
  insert into public.client_credits
   (client_id,source_type,subscription_id,contract_id,
    origin_receivable_id,origin_receipt_id,original_amount,reason,created_by)
  values (t.client_id,t.source_type,t.subscription_id,t.contract_id,
    p_receivable_id,rid,extra,'Excedente de recebimento manual',auth.uid())
  returning id into cid;
 end if;
 new_balance:=balance_before-applied-discount;
 next_status:=case when new_balance<=0 then 'paid'
   when new_balance<t.original_amount then 'partially_paid' else 'open' end;
 update public.receivables set status=next_status where id=p_receivable_id;
 -- Reserva é criada ao final da MESMA transação, com FKs para evidências.
 insert into public.manual_receivable_operations
  (operation_id,receivable_id,operation_type,operation_data,receipt_id,adjustment_id,credit_id,created_by)
 values (p_operation_id,p_receivable_id,p_mode,snapshot,rid,aid,cid,auth.uid());
 return query select rid,aid,cid,applied,extra;
end;
$fn$;
revoke all on function public.record_manual_receivable_payment(uuid,uuid,numeric,date,text,text,text,uuid,text,text,uuid)
 from public,anon;
grant execute on function public.record_manual_receivable_payment(uuid,uuid,numeric,date,text,text,text,uuid,text,text,uuid)
 to authenticated;
comment on function public.record_manual_receivable_payment is
 'Recebimento/quitação em transação única, lock de título, crédito excedente e ID estável entre retries.';
