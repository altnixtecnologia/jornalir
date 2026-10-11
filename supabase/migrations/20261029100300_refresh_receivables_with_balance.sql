-- Corrige public.receivables_with_balance (criada em
-- 20261017100000_financeiro_contas_a_receber.sql com `select r.*`): views
-- Postgres com `*` CONGELAM a lista de colunas no momento da criação —
-- todo `alter table receivables add column` feito depois (subscription_id
-- em 20261018100000, commitment_order_id em 20261019100000,
-- commercial_sale_id/installment_number em 20261028100000_comercial_publicidade.sql)
-- nunca entrou na view. Confirmado contra o banco remoto real (ver
-- relatório da tarefa de smoke test): a tabela tem as 4 colunas, a view
-- não tinha nenhuma delas, causando 500 em
-- listReceivablesAdminPageSupabase ao selecionar subscription_id.
--
-- CREATE OR REPLACE VIEW (nunca DROP) — preserva a view existente,
-- grants/policies não tocados. Mesma lógica de cálculo de sempre
-- (total_received/total_adjustments/balance a partir de receipts/
-- adjustments não estornados). Colunas enumeradas explicitamente, nunca
-- mais `select *` — a lista física atual da tabela (14 colunas originais
-- + as 4 adicionadas depois, nesta ordem) + as 3 colunas calculadas.

create or replace view public.receivables_with_balance
with (security_invoker = true)
as
select
  r.id,
  r.internal_reference,
  r.client_id,
  r.description,
  r.source_type,
  r.source_id,
  r.source_reference,
  r.contract_id,
  r.original_amount,
  r.issue_date,
  r.due_date,
  r.competency_date,
  r.status,
  r.notes,
  r.created_by,
  r.created_at,
  r.updated_at,
  coalesce(rec.total_received, 0) as total_received,
  coalesce(adj.total_adjustments, 0) as total_adjustments,
  r.original_amount - coalesce(rec.total_received, 0) - coalesce(adj.total_adjustments, 0) as balance,
  r.subscription_id,
  r.commitment_order_id,
  r.commercial_sale_id,
  r.installment_number
from public.receivables r
left join (
  select receivable_id, sum(amount) as total_received
  from public.receivable_receipts
  where reversed_at is null
  group by receivable_id
) rec on rec.receivable_id = r.id
left join (
  select receivable_id, sum(amount) as total_adjustments
  from public.receivable_adjustments
  where reversed_at is null
  group by receivable_id
) adj on adj.receivable_id = r.id;
