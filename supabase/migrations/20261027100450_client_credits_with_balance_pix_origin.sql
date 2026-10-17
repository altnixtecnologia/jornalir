-- NOVA em 17/10/2026 (preparação de publicação, reconciliação de
-- histórico). Cria a view que já existe (protegida por guarda dinâmica)
-- em 20261013033146_refresh_client_credits_with_balance_after_pix_origin.sql
-- — aquele arquivo já está aplicado no remoto sob este nome exato e tem
-- timestamp anterior a public.client_credits
-- (20261019100000_financeiro_credito_cliente.sql) e à coluna
-- origin_payment_charge_id
-- (20261027100400_payment_charge_overpayment_credit.sql, aplicada
-- imediatamente antes desta). create or replace view é idempotente.
create or replace view public.client_credits_with_balance
with (security_invoker = true)
as
select
  cc.id,
  cc.client_id,
  cc.source_type,
  cc.subscription_id,
  cc.contract_id,
  cc.origin_receivable_id,
  cc.origin_receipt_id,
  cc.original_amount,
  cc.reason,
  cc.notes,
  cc.created_by,
  cc.created_at,
  cc.reversed_at,
  cc.reversed_by,
  cc.reversal_reason,
  coalesce(app.total_applied, 0) as total_applied,
  cc.original_amount - coalesce(app.total_applied, 0) as balance,
  cc.origin_payment_charge_id
from public.client_credits cc
left join (
  select credit_id, sum(amount) as total_applied
  from public.receivable_adjustments
  where reversed_at is null
    and adjustment_type = 'credit_applied'
  group by credit_id
) app on app.credit_id = cc.id;

comment on view public.client_credits_with_balance is
  'client_credits + saldo calculado. Inclui origin_payment_charge_id para rastrear créditos originados por excedente de cobrança Pix.';
