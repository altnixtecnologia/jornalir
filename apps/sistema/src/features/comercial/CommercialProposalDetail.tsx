"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CommercialProduct, CommercialProposalStatus, CommercialProposalWithItems } from "@ir/types";
import {
  COMMERCIAL_CONDITION_LABELS,
  COMMERCIAL_PROPOSAL_STATUS_LABELS,
  COMMERCIAL_PROPOSAL_STATUS_TRANSITIONS,
  computeProposalItemTotal,
  isCommercialProposalExpired,
} from "@ir/types";
import type { ClientSearchResult } from "../../components/admin/clientSearchTypes";
import { CommercialProposalForm } from "./CommercialProposalForm";
import {
  changeCommercialProposalStatusAction,
  convertCommercialProposalToSaleAction,
  duplicateCommercialProposalAction,
} from "../../app/sistema/publicidade/propostas/[id]/actions";

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

export function CommercialProposalDetail({
  proposal,
  clientName,
  products,
  client,
}: {
  proposal: CommercialProposalWithItems;
  clientName: string;
  products: CommercialProduct[];
  client: ClientSearchResult | null;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const expired = isCommercialProposalExpired(proposal);
  const nextStatuses = COMMERCIAL_PROPOSAL_STATUS_TRANSITIONS[proposal.status];
  const editable = proposal.status === "draft" || proposal.status === "sent";

  function handleChangeStatus(to: CommercialProposalStatus): void {
    setError(null);
    startTransition(async () => {
      const result = await changeCommercialProposalStatusAction(proposal.id, to);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDuplicate(): void {
    setError(null);
    startTransition(async () => {
      const result = await duplicateCommercialProposalAction(proposal.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/sistema/publicidade/propostas/${result.id}`);
    });
  }

  function handleConvert(): void {
    setError(null);
    startTransition(async () => {
      const result = await convertCommercialProposalToSaleAction(proposal.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/sistema/publicidade/vendas/${result.saleId}`);
    });
  }

  if (editing) {
    return <CommercialProposalForm mode="edit" proposal={proposal} products={products} initialSelectedClient={client} />;
  }

  return (
    <>
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <section className="form-section form-section--first">
        <h2>Dados da proposta</h2>
        <div className="form-grid">
          <div className="form-field">
            <span className="field-label">Cliente</span>
            <span>{clientName}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Data</span>
            <span>{formatDate(proposal.proposalDate)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Validade</span>
            <span>
              {formatDate(proposal.validUntil)}
              {expired ? <span className="status-pill status-pill--overdue" style={{ marginLeft: "8px" }}>Vencida</span> : null}
            </span>
          </div>
          <div className="form-field">
            <span className="field-label">Condição comercial</span>
            <span>{COMMERCIAL_CONDITION_LABELS[proposal.commercialCondition]}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Status</span>
            <span className={statusPillClass(proposal.status)}>{COMMERCIAL_PROPOSAL_STATUS_LABELS[proposal.status]}</span>
          </div>
          {proposal.convertedSaleId ? (
            <div className="form-field">
              <span className="field-label">Convertida em venda</span>
              <Link className="materia-title-link" href={`/sistema/publicidade/vendas/${proposal.convertedSaleId}`}>
                Abrir venda
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className="form-section">
        <h2>Itens</h2>
        <div className="materias-table-wrap">
          <table className="materias-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Qtd.</th>
                <th>Valor unit.</th>
                <th>Desconto</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {proposal.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{formatAmount(item.unitPrice)}</td>
                  <td>{item.discountAmount > 0 ? formatAmount(item.discountAmount) : "—"}</td>
                  <td>{formatAmount(computeProposalItemTotal(item))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: "right" }}>
                  <strong>Total</strong>
                </td>
                <td>
                  <strong>{formatAmount(proposal.total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {proposal.notes || proposal.internalNotes ? (
        <section className="form-section">
          <h2>Observações</h2>
          {proposal.notes ? <p>{proposal.notes}</p> : null}
          {proposal.internalNotes ? <p className="helper-text">Interna: {proposal.internalNotes}</p> : null}
        </section>
      ) : null}

      <section className="form-section">
        <div className="form-actions">
          {editable ? (
            <button type="button" onClick={() => setEditing(true)} disabled={pending}>
              Editar
            </button>
          ) : null}
          <Link href={`/sistema/publicidade/propostas/${proposal.id}/imprimir`}>Imprimir</Link>
          <button type="button" onClick={handleDuplicate} disabled={pending}>
            Duplicar
          </button>
          {nextStatuses
            .filter((status) => status !== "archived")
            .map((status) => (
              <button key={status} type="button" onClick={() => handleChangeStatus(status)} disabled={pending}>
                Marcar como {COMMERCIAL_PROPOSAL_STATUS_LABELS[status].toLowerCase()}
              </button>
            ))}
          {proposal.status === "approved" && !proposal.convertedSaleId ? (
            <button type="button" className="form-action-primary" onClick={handleConvert} disabled={pending}>
              {pending ? "Convertendo…" : "Converter em venda"}
            </button>
          ) : null}
          {proposal.status !== "archived" ? (
            <button type="button" className="form-action-danger" onClick={() => handleChangeStatus("archived")} disabled={pending}>
              Arquivar
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
