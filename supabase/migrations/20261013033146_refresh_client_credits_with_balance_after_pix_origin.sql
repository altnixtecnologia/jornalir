-- GUARDA adicionada em 17/10/2026 (reconciliação de histórico): este
-- arquivo já está aplicado no remoto sob este nome exato (não pode ser
-- renomeado) e depende de public.client_credits (só existe a partir de
-- 20261019100000_financeiro_credito_cliente.sql, 6 dias depois) e da
-- coluna origin_payment_charge_id (só existe a partir de
-- 20261027100400_payment_charge_overpayment_credit.sql, 14 dias depois).
-- EXECUTE dinâmico garante que a definição da view só é resolvida quando
-- as duas dependências já existem — não é um arquivo vazio, é a MESMA
-- view original, só protegida. Criação real para fresh install em
-- 20261027100450_client_credits_with_balance_pix_origin.sql (nova, depois
-- das duas dependências).
do $$
begin
  if to_regclass('public.client_credits') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'client_credits'
         and column_name = 'origin_payment_charge_id'
     )
  then
    execute $view$
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
      ) app on app.credit_id = cc.id
    $view$;

    comment on view public.client_credits_with_balance is
      'client_credits + saldo calculado. Inclui origin_payment_charge_id para rastrear créditos originados por excedente de cobrança Pix.';
  end if;
end $$;
