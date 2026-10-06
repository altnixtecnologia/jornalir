import Link from "next/link";
import { RECEIVABLE_SOURCE_TYPE_LABELS, RECEIVABLE_STATUS_LABELS, computeReceivableDueFlag, type ReceivableDueFlag } from "@ir/types";
import type { ReceivableListItem } from "../../providers/supabase/receivableRepository.supabase";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function statusPillClass(status: ReceivableListItem["status"]): string {
  if (status === "paid") return "status-pill status-pill--published";
  if (status === "partially_paid") return "status-pill status-pill--adjusting";
  if (status === "cancelled") return "status-pill status-pill--archived";
  return "status-pill status-pill--scheduled";
}

function DueBadge({ flag }: { flag: ReceivableDueFlag }): JSX.Element | null {
  if (flag === "overdue") return <span className="status-pill status-pill--overdue">Vencido</span>;
  if (flag === "due_today") return <span className="status-pill status-pill--adjusting">Vence hoje</span>;
  if (flag === "due_soon") return <span className="status-pill status-pill--adjusting">Vencendo</span>;
  return null;
}

/** Listagem de Contas a Receber (Parte 3A, item 19/9) — tabela + cards
 * mobile, mesma convenção do restante do painel. Destaque visual
 * discreto de vencido/vence hoje/vencendo/parcial/quitado/cancelado —
 * nunca cobrança/inadimplência real calculada aqui. */
export function ReceivablesList({ receivables }: { receivables: ReceivableListItem[] }): JSX.Element {
  if (receivables.length === 0) {
    return <p className="helper-text">Nenhum título encontrado com os filtros atuais.</p>;
  }

  return (
    <>
      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Referência</th>
              <th>Cliente</th>
              <th>Descrição</th>
              <th>Origem</th>
              <th>Vencimento</th>
              <th>Valor original</th>
              <th>Recebido</th>
              <th>Abatimentos</th>
              <th>Saldo</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {receivables.map((receivable) => {
              const flag = computeReceivableDueFlag(receivable.dueDate, receivable.status);
              return (
                <tr key={receivable.id} className={flag ? `subscription-row--${flag === "overdue" ? "overdue" : "due-soon"}` : undefined}>
                  <td className="materia-reference">{receivable.reference}</td>
                  <td>
                    <Link className="materia-title materia-title-link" href={`/sistema/financeiro/contas-a-receber/${receivable.id}`}>
                      {receivable.clientName}
                    </Link>
                  </td>
                  <td>{receivable.description}</td>
                  <td>{RECEIVABLE_SOURCE_TYPE_LABELS[receivable.sourceType]}</td>
                  <td>
                    {formatDate(receivable.dueDate)} <DueBadge flag={flag} />
                  </td>
                  <td>{formatAmount(receivable.originalAmount)}</td>
                  <td>{formatAmount(receivable.totalReceived)}</td>
                  <td>{formatAmount(receivable.totalAdjustments)}</td>
                  <td>{formatAmount(receivable.balance)}</td>
                  <td>
                    <span className={statusPillClass(receivable.status)}>{RECEIVABLE_STATUS_LABELS[receivable.status]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="materias-cards">
        {receivables.map((receivable) => {
          const flag = computeReceivableDueFlag(receivable.dueDate, receivable.status);
          return (
            <li key={receivable.id}>
              <Link
                className={`materia-card${flag ? ` subscription-row--${flag === "overdue" ? "overdue" : "due-soon"}` : ""}`}
                href={`/sistema/financeiro/contas-a-receber/${receivable.id}`}
              >
                <div className="materia-card-head">
                  <span className="materia-card-title">{receivable.clientName}</span>
                  <span className={statusPillClass(receivable.status)}>{RECEIVABLE_STATUS_LABELS[receivable.status]}</span>
                </div>
                <span className="materia-card-meta">{receivable.description}</span>
                <span className="materia-card-meta">
                  {RECEIVABLE_SOURCE_TYPE_LABELS[receivable.sourceType]} · Vencimento {formatDate(receivable.dueDate)} <DueBadge flag={flag} />
                </span>
                <span className="materia-card-meta">
                  Original {formatAmount(receivable.originalAmount)} · Recebido {formatAmount(receivable.totalReceived)} · Saldo {formatAmount(receivable.balance)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
