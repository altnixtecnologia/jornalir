import Link from "next/link";
import { SUBSCRIPTION_PERIODICITY_LABELS, SUBSCRIPTION_SERVICE_TYPE_LABELS, SUBSCRIPTION_STATUS_LABELS } from "@ir/types";
import type { SubscriptionListItem } from "../../providers/supabase/subscriptionRepository.supabase";

const DUE_SOON_DAYS = 7;

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function statusPillClass(status: SubscriptionListItem["status"]): string {
  if (status === "active") return "status-pill status-pill--published";
  if (status === "suspended") return "status-pill status-pill--scheduled";
  return "status-pill status-pill--archived";
}

/** Só sinalização visual nesta fase — nenhuma cobrança/inadimplência real
 * é calculada aqui, só a comparação de `nextDueDate` com hoje. */
type DueFlag = "overdue" | "due-soon" | null;

function dueFlag(subscription: SubscriptionListItem): DueFlag {
  if (subscription.status !== "active" || !subscription.nextDueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${subscription.nextDueDate}T00:00:00`);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays <= DUE_SOON_DAYS) return "due-soon";
  return null;
}

function DueBadge({ flag }: { flag: DueFlag }): JSX.Element | null {
  if (flag === "overdue") return <span className="status-pill status-pill--overdue">Vencida</span>;
  if (flag === "due-soon") return <span className="status-pill status-pill--adjusting">Vence em breve</span>;
  return null;
}

/** Lista de assinaturas — tabela + versão em card pra mobile, mesma
 * convenção do editorial/clientes: filtro/busca/paginação ficam na página
 * servidora, este componente só renderiza o que já veio filtrado/paginado. */
export function SubscriptionsList({ subscriptions }: { subscriptions: SubscriptionListItem[] }): JSX.Element {
  if (subscriptions.length === 0) {
    return <p className="helper-text">Nenhuma assinatura encontrada com os filtros atuais.</p>;
  }

  return (
    <>
      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Referência</th>
              <th>Cliente</th>
              <th>Serviço</th>
              <th>Periodicidade</th>
              <th>Valor</th>
              <th>Próximo vencimento</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((subscription) => {
              const flag = dueFlag(subscription);
              return (
                <tr key={subscription.id} className={flag ? `subscription-row--${flag}` : undefined}>
                  <td className="materia-reference">{subscription.reference}</td>
                  <td>
                    <Link className="materia-title materia-title-link" href={`/sistema/assinaturas/${subscription.id}`}>
                      {subscription.clientName}
                    </Link>
                  </td>
                  <td>{SUBSCRIPTION_SERVICE_TYPE_LABELS[subscription.serviceType]}</td>
                  <td>{SUBSCRIPTION_PERIODICITY_LABELS[subscription.periodicity]}</td>
                  <td>{formatAmount(subscription.amount)}</td>
                  <td>
                    {formatDate(subscription.nextDueDate)} <DueBadge flag={flag} />
                  </td>
                  <td>
                    <span className={statusPillClass(subscription.status)}>
                      {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="materias-cards">
        {subscriptions.map((subscription) => {
          const flag = dueFlag(subscription);
          return (
            <li key={subscription.id}>
              <Link className={`materia-card${flag ? ` subscription-row--${flag}` : ""}`} href={`/sistema/assinaturas/${subscription.id}`}>
                <div className="materia-card-head">
                  <span className="materia-card-title">{subscription.clientName}</span>
                  <span className={statusPillClass(subscription.status)}>
                    {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                  </span>
                </div>
                <span className="materia-card-meta">
                  {SUBSCRIPTION_SERVICE_TYPE_LABELS[subscription.serviceType]} · {SUBSCRIPTION_PERIODICITY_LABELS[subscription.periodicity]} · {formatAmount(subscription.amount)}
                </span>
                <span className="materia-card-meta">
                  Próximo vencimento {formatDate(subscription.nextDueDate)} <DueBadge flag={flag} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
