import Link from "next/link";
import { SUBSCRIPTION_PERIODICITY_LABELS, SUBSCRIPTION_SERVICE_TYPE_LABELS, SUBSCRIPTION_STATUS_LABELS } from "@ir/types";
import type { SubscriptionListItem } from "../../providers/supabase/subscriptionRepository.supabase";

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
              <th>Início</th>
              <th>Vencimento</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((subscription) => (
              <tr key={subscription.id}>
                <td className="materia-reference">{subscription.reference}</td>
                <td>
                  <Link className="materia-title materia-title-link" href={`/sistema/assinaturas/${subscription.id}`}>
                    {subscription.clientName}
                  </Link>
                </td>
                <td>{SUBSCRIPTION_SERVICE_TYPE_LABELS[subscription.serviceType]}</td>
                <td>{SUBSCRIPTION_PERIODICITY_LABELS[subscription.periodicity]}</td>
                <td>{formatAmount(subscription.amount)}</td>
                <td>{formatDate(subscription.startsAt)}</td>
                <td>{formatDate(subscription.dueDate)}</td>
                <td>
                  <span className={statusPillClass(subscription.status)}>
                    {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="materias-cards">
        {subscriptions.map((subscription) => (
          <li key={subscription.id}>
            <Link className="materia-card" href={`/sistema/assinaturas/${subscription.id}`}>
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
                Início {formatDate(subscription.startsAt)} · Vencimento {formatDate(subscription.dueDate)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
