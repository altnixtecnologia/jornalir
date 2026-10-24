-- Estornos financeiros seguros: sem alteração parcial ou PATCH direto.
-- Operações exigem permissão granular, vínculo correto, bloqueio do título
-- e reavaliação do saldo na mesma transação.
drop policy if exists receivable_receipts_update_staff on public.receivable_receipts;
drop policy if exists receivable_adjustments_update_staff on public.receivable_adjustments;
revoke update on public.receivable_receipts from public, anon, authenticated;
revoke update on public.receivable_adjustments from public, anon, authenticated;
grant update on public.receivable_receipts, public.receivable_adjustments to service_role;

create function public.reverse_receivable_receipt_safe(
 p_receivable_id uuid,p_receipt_id uuid,p_reason text
)
returns table(item_id uuid, receivable_status text, balance numeric, already_reversed boolean)
language plpgsql security definer set search_path='' as $fn$
declare
 t public.receivables;
 rec public.receivable_receipts;
 got numeric;
 adj numeric;
 new_balance numeric;
 new_status text;
begin
 if not coalesce(public.staff_can_finance_action('recebimentos_estornar'),false) then
  raise exception 'Sem permissão de estorno de recebimento.' using errcode='42501';
 end if;
 if p_receivable_id is null or p_receipt_id is null
    or nullif(btrim(coalesce(p_reason,'')),'') is null then
  raise exception 'Título, recebimento e motivo são obrigatórios.' using errcode='22023';
 end if;
 -- Todas as operações que consomem saldo do título usam FOR UPDATE.
 select * into t from public.receivables where id=p_receivable_id for update;
 if not found then raise exception 'Título não encontrado.' using errcode='22023'; end if;
 select * into rec from public.receivable_receipts
   where id=p_receipt_id and receivable_id=p_receivable_id for update;
 if not found then raise exception 'Recebimento não pertence a este título.' using errcode='22023'; end if;
 if t.status='cancelled' then
  raise exception 'Título cancelado: estorno exige conciliação administrativa.' using errcode='22023';
 end if;
 -- Bloqueio de origens que exigem conciliação além de remover receipt.
 if exists(select 1 from public.payment_charges pc where pc.receipt_id=rec.id)
 then raise exception 'Recebimento vinculado a Pix: concilie no Asaas antes do estorno.' using errcode='22023'; end if;
 if exists(select 1 from public.client_credits c where c.origin_receipt_id=rec.id and c.reversed_at is null)
 then raise exception 'Recebimento originou crédito: concilie o crédito antes do estorno.' using errcode='22023'; end if;
 if exists(select 1 from public.manual_receivable_operations m
           where m.receipt_id=rec.id and m.operation_type='settlement')
 then raise exception 'Recebimento de quitação com diferença exige reversão conjunta, indisponível neste fluxo.' using errcode='22023'; end if;
 if rec.reversed_at is not null then
  if rec.reversed_by is distinct from auth.uid() or rec.reversal_reason is distinct from btrim(p_reason)
  then raise exception 'Recebimento já estornado; consulte o histórico.' using errcode='22023'; end if;
 else
  update public.receivable_receipts set
   reversed_at=clock_timestamp(),reversed_by=auth.uid(),reversal_reason=btrim(p_reason)
  where id=rec.id and reversed_at is null;
 end if;
 select coalesce(sum(amount),0) into got from public.receivable_receipts
   where receivable_id=t.id and reversed_at is null;
 select coalesce(sum(amount),0) into adj from public.receivable_adjustments
   where receivable_id=t.id and reversed_at is null;
 new_balance:=t.original_amount-got-adj;
 new_status:=case when new_balance<=0 then 'paid'
   when new_balance<t.original_amount then 'partially_paid' else 'open' end;
 if t.status is distinct from new_status then
   update public.receivables set status=new_status where id=t.id;
 end if;
 return query select rec.id,new_status,new_balance,(rec.reversed_at is not null);
end;
$fn$;

create function public.reverse_receivable_adjustment_safe(
 p_receivable_id uuid,p_adjustment_id uuid,p_reason text
)
returns table(item_id uuid, receivable_status text, balance numeric, already_reversed boolean)
language plpgsql security definer set search_path='' as $fn$
declare
 t public.receivables;
 a public.receivable_adjustments;
 v_credit public.client_credits;
 credit_to_lock uuid;
 got numeric;
 adj numeric;
 new_balance numeric;
 new_status text;
 was_reversed boolean;
begin
 if not coalesce(public.staff_can_finance_action('ajustes_estornar'),false) then
  raise exception 'Sem permissão de estorno de abatimento.' using errcode='42501';
 end if;
 if p_receivable_id is null or p_adjustment_id is null
    or nullif(btrim(coalesce(p_reason,'')),'') is null then
  raise exception 'Título, abatimento e motivo são obrigatórios.' using errcode='22023';
 end if;
 -- Créditos são bloqueados primeiro, como na RPC apply_client_credit.
 -- Evita corrida/deadlock com nova aplicação do mesmo crédito.
 select credit_id into credit_to_lock from public.receivable_adjustments
   where id=p_adjustment_id and receivable_id=p_receivable_id;
 if not found then raise exception 'Abatimento não pertence ao título.' using errcode='22023'; end if;
 if credit_to_lock is not null then
  select * into v_credit from public.client_credits where id=credit_to_lock for update;
  if not found or v_credit.reversed_at is not null then
   raise exception 'Crédito vinculado não está disponível para estorno automático.' using errcode='22023';
  end if;
 end if;
 select * into t from public.receivables where id=p_receivable_id for update;
 if not found then raise exception 'Título não encontrado.' using errcode='22023'; end if;
 select * into a from public.receivable_adjustments
   where id=p_adjustment_id and receivable_id=p_receivable_id for update;
 if not found or a.credit_id is distinct from credit_to_lock then
  raise exception 'Abatimento mudou durante o processamento.' using errcode='22023';
 end if;
 if t.status='cancelled' then
  raise exception 'Título cancelado: estorno exige conciliação administrativa.' using errcode='22023';
 end if;
 if exists(select 1 from public.manual_receivable_operations m
       where m.adjustment_id=a.id and m.operation_type='settlement') then
  raise exception 'Quitação com diferença exige reversão conjunta; estorno isolado bloqueado.' using errcode='22023';
 end if;
 was_reversed:=a.reversed_at is not null;
 if was_reversed then
  if a.reversed_by is distinct from auth.uid() or a.reversal_reason is distinct from btrim(p_reason)
  then raise exception 'Abatimento já estornado; consulte o histórico.' using errcode='22023'; end if;
 else
  update public.receivable_adjustments set
    reversed_at=clock_timestamp(),reversed_by=auth.uid(),reversal_reason=btrim(p_reason)
  where id=a.id and reversed_at is null;
 end if;
 select coalesce(sum(amount),0) into got from public.receivable_receipts
   where receivable_id=t.id and reversed_at is null;
 select coalesce(sum(amount),0) into adj from public.receivable_adjustments
   where receivable_id=t.id and reversed_at is null;
 new_balance:=t.original_amount-got-adj;
 new_status:=case when new_balance<=0 then 'paid'
   when new_balance<t.original_amount then 'partially_paid' else 'open' end;
 if t.status is distinct from new_status then
   update public.receivables set status=new_status where id=t.id;
 end if;
 return query select a.id,new_status,new_balance,was_reversed;
end;
$fn$;

revoke all on function public.reverse_receivable_receipt_safe(uuid,uuid,text) from public, anon;
revoke all on function public.reverse_receivable_adjustment_safe(uuid,uuid,text) from public, anon;
grant execute on function public.reverse_receivable_receipt_safe(uuid,uuid,text) to authenticated;
grant execute on function public.reverse_receivable_adjustment_safe(uuid,uuid,text) to authenticated;
comment on function public.reverse_receivable_receipt_safe(uuid,uuid,text) is
 'Estorna recibo apenas com ação granular, sem vínculo Pix/crédito/quitação, sob lock e com recálculo transacional do título.';
comment on function public.reverse_receivable_adjustment_safe(uuid,uuid,text) is
 'Estorna abatimento com lock crédito→título, sem quitação especial, recálculo transacional; retorno idempotente.';
