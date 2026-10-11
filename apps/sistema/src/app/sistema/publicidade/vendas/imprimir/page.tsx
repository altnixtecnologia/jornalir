import type { CommercialSaleFinancialStatus, CommercialSaleStatus } from "@ir/types";
import { COMMERCIAL_SALE_FINANCIAL_STATUS_LABELS, COMMERCIAL_SALE_STATUS_LABELS, COMMERCIAL_SALE_STATUSES, deriveCommercialSaleFinancialStatus } from "@ir/types";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listCommercialSalesAdminPageSupabase } from "../../../../../providers/supabase/commercialSaleRepository.supabase";
import { listReceivablesForCommercialSalesSupabase } from "../../../../../providers/supabase/receivableRepository.supabase";
import { PrintButton } from "../../../../../features/financeiro/PrintButton";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Relatório comercial (item 32) — respeita os mesmos filtros da
 * listagem, primeira versão via window.print()/@media print (mesmo
 * padrão já usado no relatório financeiro — print-report/PrintButton
 * reaproveitados, nenhuma dependência nova de PDF).
 */
export default async function CommercialSalesPrintPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const status = one(searchParams?.status);

  const result = await listCommercialSalesAdminPageSupabase(supabase, {
    page: 1,
    pageSize: 1000,
    search: one(searchParams?.q) || undefined,
    status: COMMERCIAL_SALE_STATUSES.includes(status as CommercialSaleStatus) ? (status as CommercialSaleStatus) : undefined,
    startFrom: one(searchParams?.startFrom) || undefined,
    startTo: one(searchParams?.startTo) || undefined,
  });

  const receivables = await listReceivablesForCommercialSalesSupabase(supabase, result.sales.map((sale) => sale.id));
  const receivablesBySale = new Map<string, typeof receivables>();
  for (const receivable of receivables) {
    if (!receivable.commercialSaleId) continue;
    const list = receivablesBySale.get(receivable.commercialSaleId) ?? [];
    list.push(receivable);
    receivablesBySale.set(receivable.commercialSaleId, list);
  }
  const financialStatusBySaleId = new Map<string, CommercialSaleFinancialStatus>(
    result.sales.map((sale) => [sale.id, deriveCommercialSaleFinancialStatus(receivablesBySale.get(sale.id) ?? [])]),
  );

  const totalContratado = result.sales.filter((sale) => sale.status !== "cancelled").reduce((sum, sale) => sum + sale.amount, 0);

  return (
    <div className="print-report">
      <div className="print-report-toolbar">
        <PrintButton />
      </div>
      <h1>Relatório comercial — vendas/publicidade</h1>
      <p className="print-report-meta">Gerado em {new Date().toLocaleString("pt-BR")} · {result.total} venda(s)</p>

      <table className="print-report-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Publicidade</th>
            <th>Período</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Situação financeira</th>
          </tr>
        </thead>
        <tbody>
          {result.sales.map((sale) => (
            <tr key={sale.id}>
              <td>{sale.clientName}</td>
              <td>{sale.channel} — {sale.description}</td>
              <td>
                {formatDate(sale.startDate)}
                {sale.endDate ? ` a ${formatDate(sale.endDate)}` : ""}
              </td>
              <td>{formatAmount(sale.amount)}</td>
              <td>{COMMERCIAL_SALE_STATUS_LABELS[sale.status]}</td>
              <td>{COMMERCIAL_SALE_FINANCIAL_STATUS_LABELS[financialStatusBySaleId.get(sale.id) ?? "not_generated"]}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Total contratado (exclui canceladas)</td>
            <td>{formatAmount(totalContratado)}</td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
