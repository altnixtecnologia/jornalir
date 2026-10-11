import Link from "next/link";
import type { CommercialProposalStatus } from "@ir/types";
import { COMMERCIAL_PROPOSAL_STATUS_LABELS, isCommercialProposalExpired } from "@ir/types";

export interface CommercialProposalListItem {
  id: string;
  reference: string;
  clientName: string;
  proposalDate: string;
  validUntil?: string;
  status: CommercialProposalStatus;
  total: number;
}

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function statusPillClass(status: CommercialProposalStatus): string {
  if (status === "approved") return "status-pill status-pill--published";
  if (status === "sent") return "status-pill status-pill--scheduled";
  if (status === "rejected" || status === "archived") return "status-pill status-pill--archived";
  return "status-pill status-pill--draft";
}

export function CommercialProposalsList({ proposals }: { proposals: CommercialProposalListItem[] }): JSX.Element {
  if (proposals.length === 0) {
    return <p className="helper-text">Nenhuma proposta encontrada com os filtros atuais.</p>;
  }

  return (
    <>
      <div className="materias-table-wrap">
        <table className="materias-table">
          <thead>
            <tr>
              <th>Referência</th>
              <th>Cliente</th>
              <th>Data</th>
              <th>Validade</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((proposal) => {
              const expired = isCommercialProposalExpired(proposal);
              return (
                <tr key={proposal.id}>
                  <td className="materia-reference">{proposal.reference}</td>
                  <td>
                    <Link className="materia-title materia-title-link" href={`/sistema/publicidade/propostas/${proposal.id}`}>
                      {proposal.clientName}
                    </Link>
                  </td>
                  <td>{formatDate(proposal.proposalDate)}</td>
                  <td>
                    {formatDate(proposal.validUntil)}
                    {expired ? <span className="status-pill status-pill--overdue" style={{ marginLeft: "6px" }}>Vencida</span> : null}
                  </td>
                  <td>{formatAmount(proposal.total)}</td>
                  <td>
                    <span className={statusPillClass(proposal.status)}>{COMMERCIAL_PROPOSAL_STATUS_LABELS[proposal.status]}</span>
                  </td>
                  <td>
                    <Link className="secondary-link" href={`/sistema/publicidade/propostas/${proposal.id}`}>
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
        {proposals.map((proposal) => {
          const expired = isCommercialProposalExpired(proposal);
          return (
            <li key={proposal.id}>
              <Link className="materia-card" href={`/sistema/publicidade/propostas/${proposal.id}`}>
                <div className="materia-card-head">
                  <span className="materia-card-title">{proposal.clientName}</span>
                  <span className={statusPillClass(proposal.status)}>{COMMERCIAL_PROPOSAL_STATUS_LABELS[proposal.status]}</span>
                </div>
                <span className="materia-card-meta">
                  {formatDate(proposal.proposalDate)} · Validade {formatDate(proposal.validUntil)} {expired ? "(vencida)" : ""}
                </span>
                <span className="materia-card-meta">{formatAmount(proposal.total)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
