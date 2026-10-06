"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContractCommitmentOrder, ContractDocument } from "@ir/types";
import { CONTRACT_DOCUMENT_TYPE_LABELS } from "@ir/types";
import { addCommitmentOrderAction } from "../../app/sistema/financeiro/contratos/actions";

function formatAmount(value?: number): string {
  if (value === undefined) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

/**
 * Empenhos (Bloco 2, item 4) — entidade operacional própria. Um
 * contrato pode ter nenhum, um (global) ou vários empenhos ao longo da
 * vigência; nenhum título é obrigado a referenciar um (preparação só —
 * o vínculo título↔empenho ainda não tem UI própria nesta fase).
 */
export function ContractCommitmentOrdersPanel({
  contractId,
  commitmentOrders,
  documents,
}: {
  contractId: string;
  commitmentOrders: ContractCommitmentOrder[];
  documents: ContractDocument[];
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [number, setNumber] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [competencyDate, setCompetencyDate] = useState("");
  const [description, setDescription] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [notes, setNotes] = useState("");

  function resetForm(): void {
    setNumber("");
    setAmount("");
    setCompetencyDate("");
    setDescription("");
    setDocumentId("");
    setNotes("");
    setShowForm(false);
  }

  function handleSave(): void {
    setError(null);
    startTransition(async () => {
      const result = await addCommitmentOrderAction(contractId, {
        number,
        issueDate,
        amount,
        competencyDate,
        description,
        documentId,
        notes,
      });
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  const documentById = new Map(documents.map((document) => [document.id, document]));

  return (
    <section className="form-section">
      <h2>Empenhos</h2>
      <p className="helper-text">
        Um contrato pode ter nenhum, um empenho global ou vários ao longo da vigência — nenhum título é obrigado a ter empenho.
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {!showForm ? (
        <div className="form-actions">
          <button type="button" onClick={() => setShowForm(true)} disabled={pending}>
            Registrar empenho
          </button>
        </div>
      ) : (
        <div className="form-grid" style={{ marginTop: "12px" }}>
          <label className="form-field">
            <span className="field-label">Número</span>
            <input type="text" value={number} onChange={(event) => setNumber(event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Data</span>
            <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Valor (R$) <span className="field-optional">(opcional)</span></span>
            <input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
          </label>
          <label className="form-field">
            <span className="field-label">Competência <span className="field-optional">(opcional)</span></span>
            <input type="date" value={competencyDate} onChange={(event) => setCompetencyDate(event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Documento relacionado <span className="field-optional">(opcional)</span></span>
            <select value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
              <option value="">Nenhum</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name} ({CONTRACT_DOCUMENT_TYPE_LABELS[document.documentType]})
                </option>
              ))}
            </select>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Descrição <span className="field-optional">(opcional)</span></span>
            <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="form-action-primary" onClick={handleSave} disabled={pending}>
              {pending ? "Salvando…" : "Salvar empenho"}
            </button>
            <button type="button" onClick={resetForm} disabled={pending}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {commitmentOrders.length === 0 ? (
        <p className="helper-text" style={{ marginTop: "12px" }}>
          Nenhum empenho registrado ainda.
        </p>
      ) : (
        <ul className="destaques-list" style={{ marginTop: "12px" }}>
          {commitmentOrders.map((order) => (
            <li key={order.id} className="destaques-item">
              <div className="destaques-item-body">
                <span className="materia-title">Empenho {order.number}{order.amount !== undefined ? ` — ${formatAmount(order.amount)}` : ""}</span>
                <span className="helper-text">
                  {formatDate(order.issueDate)}
                  {order.competencyDate ? ` · competência ${formatDate(order.competencyDate)}` : ""}
                  {order.documentId && documentById.get(order.documentId) ? ` · doc.: ${documentById.get(order.documentId)?.name}` : ""}
                </span>
                {order.description ? <span className="helper-text">{order.description}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
