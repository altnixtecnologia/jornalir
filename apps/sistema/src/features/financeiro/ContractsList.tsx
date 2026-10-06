import Link from "next/link";
import { CONTRACT_STATUS_LABELS, clientDisplayName, computeContractVigencyFlag } from "@ir/types";
import type { Client, InstitutionalContract } from "@ir/types";

function formatAmount(value?: number): string {
  if (value === undefined) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function statusPillClass(status: InstitutionalContract["status"]): string {
  if (status === "active") return "status-pill status-pill--published";
  if (status === "suspended") return "status-pill status-pill--draft";
  return "status-pill status-pill--archived";
}

/** Badge de vigência — SEMPRE derivado (nunca gravado), mesmo princípio de PublicationCell/computeReceivableDueFlag. */
function VigencyBadge({ contract }: { contract: InstitutionalContract }): JSX.Element | null {
  const flag = computeContractVigencyFlag(contract.endsAt, contract.status);
  if (!flag) return null;
  return (
    <span className={`status-pill ${flag === "expired" ? "status-pill--overdue" : "status-pill--scheduled"}`}>
      {flag === "expired" ? "Vigência encerrada" : "Vence em breve"}
    </span>
  );
}

/** Listagem de contratos institucionais — tabela + cards mobile, mesma convenção do restante do painel. */
export function ContractsList({ contracts, clients }: { contracts: InstitutionalContract[]; clients: Client[] }): JSX.Element {
  const clientById = new Map(clients.map((client) => [client.id, client]));

  if (contracts.length === 0) {
    return <p className="helper-text">Nenhum contrato encontrado.</p>;
  }

  return (
    <>
      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Referência</th>
              <th>Cliente/órgão</th>
              <th>Número</th>
              <th>Objeto</th>
              <th>Vigência</th>
              <th>Valor contratado</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => {
              const client = clientById.get(contract.clientId);
              return (
                <tr key={contract.id}>
                  <td className="materia-reference">{contract.reference}</td>
                  <td>
                    <Link className="materia-title materia-title-link" href={`/sistema/financeiro/contratos/${contract.id}`}>
                      {client ? clientDisplayName(client) : "—"}
                    </Link>
                  </td>
                  <td>{contract.contractNumber || "—"}</td>
                  <td>{contract.object || "—"}</td>
                  <td>{formatDate(contract.startsAt)} – {formatDate(contract.endsAt)}</td>
                  <td>{formatAmount(contract.contractedAmount)}</td>
                  <td>
                    <span className={statusPillClass(contract.status)}>{CONTRACT_STATUS_LABELS[contract.status]}</span> <VigencyBadge contract={contract} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="materias-cards">
        {contracts.map((contract) => {
          const client = clientById.get(contract.clientId);
          return (
            <li key={contract.id}>
              <Link className="materia-card" href={`/sistema/financeiro/contratos/${contract.id}`}>
                <div className="materia-card-head">
                  <span className="materia-card-title">{client ? clientDisplayName(client) : "—"}</span>
                  <span className={statusPillClass(contract.status)}>{CONTRACT_STATUS_LABELS[contract.status]}</span> <VigencyBadge contract={contract} />
                </div>
                <span className="materia-card-meta">{contract.object || "Sem objeto informado"}</span>
                <span className="materia-card-meta">
                  Vigência {formatDate(contract.startsAt)} – {formatDate(contract.endsAt)} · {formatAmount(contract.contractedAmount)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
