"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContractAmendment, ContractDocument } from "@ir/types";
import { CONTRACT_DOCUMENT_TYPE_LABELS } from "@ir/types";
import { addContractAmendmentAction } from "../../app/sistema/financeiro/contratos/actions";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

/**
 * Aditivos contratuais (Parte 3B, item 9 + Bloco 2, item 3) — sem
 * gestão jurídica complexa de propósito. NUNCA altera o valor/vigência
 * original do contrato; cada aditivo é um registro próprio e o valor/
 * vigência vigentes (mostrados no resumo acima) são sempre calculados
 * somando os aditivos ao original — histórico sempre preservado.
 * `amount` pode ser negativo (redução) — nunca zero.
 */
export function ContractAmendmentsPanel({
  contractId,
  amendments,
  documents,
}: {
  contractId: string;
  amendments: ContractAmendment[];
  documents: ContractDocument[];
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [amount, setAmount] = useState("");
  const [newEndsAt, setNewEndsAt] = useState("");
  const [amendmentNumber, setAmendmentNumber] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  function resetForm(): void {
    setAmount("");
    setNewEndsAt("");
    setAmendmentNumber("");
    setEffectiveDate("");
    setDocumentId("");
    setReason("");
    setNotes("");
    setShowForm(false);
  }

  function handleSave(): void {
    setError(null);
    startTransition(async () => {
      const result = await addContractAmendmentAction(contractId, {
        amount,
        newEndsAt,
        amendmentNumber,
        effectiveDate,
        documentId,
        reason,
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
      <h2>Aditivos</h2>
      <p className="helper-text">
        Acréscimo (valor positivo) ou redução (valor negativo) de valor e/ou nova data final de vigência. Nunca altera o valor/vigência original do contrato — o histórico completo fica aqui.
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {!showForm ? (
        <div className="form-actions">
          <button type="button" onClick={() => setShowForm(true)} disabled={pending}>
            Registrar aditivo
          </button>
        </div>
      ) : (
        <div className="form-grid" style={{ marginTop: "12px" }}>
          <label className="form-field">
            <span className="field-label">Valor (R$) — negativo pra redução</span>
            <input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00 ou -0,00" />
          </label>
          <label className="form-field">
            <span className="field-label">Número/referência <span className="field-optional">(opcional)</span></span>
            <input type="text" value={amendmentNumber} onChange={(event) => setAmendmentNumber(event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Data de vigência do aditivo <span className="field-optional">(opcional)</span></span>
            <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Nova data final de vigência <span className="field-optional">(opcional)</span></span>
            <input type="date" value={newEndsAt} onChange={(event) => setNewEndsAt(event.target.value)} />
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
            <span className="field-label">Motivo <span className="field-optional">(opcional)</span></span>
            <textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="form-action-primary" onClick={handleSave} disabled={pending}>
              {pending ? "Salvando…" : "Salvar aditivo"}
            </button>
            <button type="button" onClick={resetForm} disabled={pending}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {amendments.length === 0 ? (
        <p className="helper-text" style={{ marginTop: "12px" }}>
          Nenhum aditivo registrado ainda.
        </p>
      ) : (
        <ul className="destaques-list" style={{ marginTop: "12px" }}>
          {amendments.map((amendment) => (
            <li key={amendment.id} className="destaques-item">
              <div className="destaques-item-body">
                <span className="materia-title">
                  {amendment.amount >= 0 ? "+" : ""}{formatAmount(amendment.amount)}
                  {amendment.amendmentNumber ? ` · ${amendment.amendmentNumber}` : ""}
                </span>
                <span className="helper-text">
                  {amendment.effectiveDate ? `Vigente desde ${formatDate(amendment.effectiveDate)} · ` : ""}
                  {amendment.newEndsAt ? `Nova vigência: ${formatDate(amendment.newEndsAt)} · ` : ""}
                  registrado em {formatDateTime(amendment.createdAt)}
                  {amendment.documentId && documentById.get(amendment.documentId) ? ` · doc.: ${documentById.get(amendment.documentId)?.name}` : ""}
                </span>
                {amendment.reason ? <span className="helper-text">{amendment.reason}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
