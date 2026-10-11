import Link from "next/link";
import { COMMERCIAL_SALE_FINANCIAL_STATUS_LABELS, COMMERCIAL_SALE_STATUS_LABELS, type CommercialSaleFinancialStatus, type CommercialSaleStatus } from "@ir/types";
import type { CommercialSaleListItem } from "../../providers/supabase/commercialSaleRepository.supabase";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function statusPillClass(status: CommercialSaleStatus): string {
  if (status === "completed") return "status-pill status-pill--published";
  if (status === "active") return "status-pill status-pill--scheduled";
  if (status === "cancelled") return "status-pill status-pill--archived";
  return "status-pill status-pill--draft";
}

function financialPillClass(status: CommercialSaleFinancialStatus): string {
  if (status === "paid") return "status-pill status-pill--published";
  if (status === "partial") return "status-pill status-pill--adjusting";
  if (status === "overdue") return "status-pill status-pill--overdue";
  if (status === "pending") return "status-pill status-pill--scheduled";
  return "status-pill status-pill--draft";
}

/** Listagem de Vendas (item 21) — tabela + cards mobile, mesma convenção
 * do restante do painel (ver ReceivablesList). CPF/CNPJ não aparece em
 * coluna própria — só o nome do cliente, sem poluir a tabela. */
export function CommercialSalesList({
  sales,
  financialStatusBySaleId,
}: {
  sales: CommercialSaleListItem[];
  financialStatusBySaleId: Map<string, CommercialSaleFinancialStatus>;
}): JSX.Element {
  if (sales.length === 0) {
    return <p className="helper-text">Nenhuma venda encontrada com os filtros atuais.</p>;
  }

  return (
    <>
      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Referência</th>
              <th>Cliente</th>
              <th>Publicidade/produto</th>
              <th>Período</th>
              <th>Valor</th>
              <th>Financeiro</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => {
              const financialStatus = financialStatusBySaleId.get(sale.id) ?? "not_generated";
              return (
                <tr key={sale.id}>
                  <td className="materia-reference">{sale.reference}</td>
                  <td>
                    <Link className="materia-title materia-title-link" href={`/sistema/publicidade/vendas/${sale.id}`}>
                      {sale.clientName}
                    </Link>
                  </td>
                  <td>{sale.channel} — {sale.description}</td>
                  <td>
                    {formatDate(sale.startDate)}
                    {sale.endDate ? ` a ${formatDate(sale.endDate)}` : ""}
                  </td>
                  <td>{formatAmount(sale.amount)}</td>
                  <td>
                    <span className={financialPillClass(financialStatus)}>{COMMERCIAL_SALE_FINANCIAL_STATUS_LABELS[financialStatus]}</span>
                  </td>
                  <td>
                    <span className={statusPillClass(sale.status)}>{COMMERCIAL_SALE_STATUS_LABELS[sale.status]}</span>
                  </td>
                  <td>
                    <Link className="secondary-link" href={`/sistema/publicidade/vendas/${sale.id}`}>
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="materias-cards">
        {sales.map((sale) => {
          const financialStatus = financialStatusBySaleId.get(sale.id) ?? "not_generated";
          return (
            <li key={sale.id}>
              <Link className="materia-card" href={`/sistema/publicidade/vendas/${sale.id}`}>
                <div className="materia-card-head">
                  <span className="materia-card-title">{sale.clientName}</span>
                  <span className={statusPillClass(sale.status)}>{COMMERCIAL_SALE_STATUS_LABELS[sale.status]}</span>
                </div>
                <span className="materia-card-meta">{sale.channel} — {sale.description}</span>
                <span className="materia-card-meta">
                  {formatDate(sale.startDate)}
                  {sale.endDate ? ` a ${formatDate(sale.endDate)}` : ""} · {formatAmount(sale.amount)}
                </span>
                <span className="materia-card-meta">
                  Financeiro: <span className={financialPillClass(financialStatus)}>{COMMERCIAL_SALE_FINANCIAL_STATUS_LABELS[financialStatus]}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
