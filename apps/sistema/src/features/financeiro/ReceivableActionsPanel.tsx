"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdjustmentType, PaymentMethod, ReceivableAdjustment, ReceivableReceipt, ReceivableWithBalance } from "@ir/types";
import { ADJUSTMENT_TYPE_LABELS, ADJUSTMENT_TYPES, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, isReversed } from "@ir/types";
import {
  addAdjustmentAction,
  addReceiptAction,
  cancelReceivableAction,
  reopenReceivableAction,
  reverseAdjustmentAction,
  reverseReceiptAction,
  settleWithDifferenceAction,
} from "../../app/sistema/financeiro/contas-a-receber/actions";
import type { StaffOption } from "../../providers/supabase/staffRepository.supabase";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

type HistoryEntry =
  | { kind: "receipt"; date: string; item: ReceivableReceipt }
  | { kind: "adjustment"; date: string; item: ReceivableAdjustment };

interface ReceivableActionsPanelProps {
  receivable: ReceivableWithBalance;
  receipts: ReceivableReceipt[];
  adjustments: ReceivableAdjustment[];
  staff: StaffOption[];
}

/**
 * Ações da conta a receber (Parte 3A, itens 4-9): registrar
 * recebimento (nunca sobrescreve um anterior), quitar com diferença
 * (nunca automático — ação explícita separada), lançar abatimento
 * (motivo obrigatório), estornar (nunca apaga — marca
 * reversed_at/reversed_by/reversal_reason) e cancelar/reabrir o título.
 * router.refresh() depois de cada ação, mesmo padrão já usado em
 * ArticleForm/SubscriptionStatusActions pra descartar o Router Cache.
 */
export function ReceivableActionsPanel({ receivable, receipts, adjustments, staff }: ReceivableActionsPanelProps): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<"none" | "receipt" | "settle" | "adjustment">("none");

  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptMethod, setReceiptMethod] = useState<PaymentMethod | "">("");
  const [receiptReference, setReceiptReference] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receivedBy, setReceivedBy] = useState("");

  const [settleReason, setSettleReason] = useState("");
  const [settleAuthorizedBy, setSettleAuthorizedBy] = useState("");

  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("discount");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentAuthorizedBy, setAdjustmentAuthorizedBy] = useState("");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");

  const staffById = useMemo(() => new Map(staff.map((person) => [person.id, person.name])), [staff]);
  function staffName(id?: string): string {
    if (!id) return "—";
    return staffById.get(id) ?? "—";
  }

  function resetForms(): void {
    setReceiptAmount("");
    setReceiptReference("");
    setReceiptNotes("");
    setReceivedBy("");
    setSettleReason("");
    setSettleAuthorizedBy("");
    setAdjustmentAmount("");
    setAdjustmentReason("");
    setAdjustmentAuthorizedBy("");
    setAdjustmentNotes("");
    setActiveForm("none");
  }

  function run(action: () => Promise<{ error: string } | void>): void {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      resetForms();
      router.refresh();
    });
  }

  const history: HistoryEntry[] = [
    ...receipts.map((item): HistoryEntry => ({ kind: "receipt", date: item.receivedAt, item })),
    ...adjustments.map((item): HistoryEntry => ({ kind: "adjustment", date: item.recordedAt, item })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const isCancelled = receivable.status === "cancelled";

  return (
    <>
      <section className="form-section">
        <h2>Ações</h2>
        {error ? <p className="form-error" role="alert">{error}</p> : null}

        {!isCancelled ? (
          <div className="form-actions">
            {activeForm !== "receipt" ? (
              <button type="button" onClick={() => setActiveForm("receipt")} disabled={pending || receivable.balance <= 0}>
                Registrar recebimento
              </button>
            ) : null}
            {activeForm !== "settle" ? (
              <button type="button" onClick={() => setActiveForm("settle")} disabled={pending || receivable.balance <= 0}>
                Quitar com diferença
              </button>
            ) : null}
            {activeForm !== "adjustment" ? (
              <button type="button" onClick={() => setActiveForm("adjustment")} disabled={pending || receivable.balance <= 0}>
                Lançar abatimento
              </button>
            ) : null}
            <button type="button" className="media-remove-button" onClick={() => run(() => cancelReceivableAction(receivable.id))} disabled={pending}>
              Cancelar título
            </button>
          </div>
        ) : (
          <div className="form-actions">
            <button type="button" onClick={() => run(() => reopenReceivableAction(receivable.id))} disabled={pending}>
              Reabrir título
            </button>
          </div>
        )}

        {activeForm === "receipt" ? (
          <div className="form-grid" style={{ marginTop: "14px" }}>
            <label className="form-field">
              <span className="field-label">Valor recebido (R$)</span>
              <input type="text" inputMode="decimal" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Data do recebimento</span>
              <input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Forma de pagamento <span className="field-optional">(opcional)</span></span>
              <select value={receiptMethod} onChange={(event) => setReceiptMethod(event.target.value as PaymentMethod | "")}>
                <option value="">Não informado</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="field-label">Quem efetivamente recebeu <span className="field-optional">(opcional)</span></span>
              <select value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)}>
                <option value="">Não informado</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="field-label">Referência/comprovante <span className="field-optional">(opcional)</span></span>
              <input type="text" value={receiptReference} onChange={(event) => setReceiptReference(event.target.value)} />
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
              <textarea rows={2} value={receiptNotes} onChange={(event) => setReceiptNotes(event.target.value)} />
            </label>
            <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
              <button
                type="button"
                className="form-action-primary"
                onClick={() =>
                  run(() =>
                    addReceiptAction(receivable.id, {
                      amount: receiptAmount,
                      receivedAt: receiptDate,
                      paymentMethod: receiptMethod,
                      reference: receiptReference,
                      notes: receiptNotes,
                      receivedByProfileId: receivedBy,
                    }),
                  )
                }
                disabled={pending}
              >
                {pending ? "Registrando…" : "Confirmar recebimento"}
              </button>
              <button type="button" onClick={resetForms} disabled={pending}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {activeForm === "settle" ? (
          <div className="form-grid" style={{ marginTop: "14px" }}>
            <p className="helper-text" style={{ gridColumn: "1 / -1" }}>
              Saldo atual: {formatAmount(receivable.balance)}. A diferença entre o saldo e o valor recebido é dispensada como abatimento — o título fica quitado.
            </p>
            <label className="form-field">
              <span className="field-label">Valor recebido (R$)</span>
              <input type="text" inputMode="decimal" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Data do recebimento</span>
              <input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Forma de pagamento <span className="field-optional">(opcional)</span></span>
              <select value={receiptMethod} onChange={(event) => setReceiptMethod(event.target.value as PaymentMethod | "")}>
                <option value="">Não informado</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="field-label">Quem efetivamente recebeu <span className="field-optional">(opcional)</span></span>
              <select value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)}>
                <option value="">Não informado</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Motivo da diferença dispensada</span>
              <textarea rows={2} value={settleReason} onChange={(event) => setSettleReason(event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Autorizado por <span className="field-optional">(opcional)</span></span>
              <select value={settleAuthorizedBy} onChange={(event) => setSettleAuthorizedBy(event.target.value)}>
                <option value="">Não informado</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
              <button
                type="button"
                className="form-action-primary"
                onClick={() =>
                  run(() =>
                    settleWithDifferenceAction(receivable.id, {
                      amount: receiptAmount,
                      receivedAt: receiptDate,
                      paymentMethod: receiptMethod,
                      reference: receiptReference,
                      notes: receiptNotes,
                      receivedByProfileId: receivedBy,
                      reason: settleReason,
                      authorizedByProfileId: settleAuthorizedBy,
                    }),
                  )
                }
                disabled={pending}
              >
                {pending ? "Quitando…" : "Confirmar quitação com diferença"}
              </button>
              <button type="button" onClick={resetForms} disabled={pending}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {activeForm === "adjustment" ? (
          <div className="form-grid" style={{ marginTop: "14px" }}>
            <label className="form-field">
              <span className="field-label">Valor do abatimento (R$)</span>
              <input type="text" inputMode="decimal" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} />
            </label>
            <label className="form-field">
              <span className="field-label">Tipo</span>
              <select value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value as AdjustmentType)}>
                {ADJUSTMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ADJUSTMENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="field-label">Autorizado por <span className="field-optional">(opcional)</span></span>
              <select value={adjustmentAuthorizedBy} onChange={(event) => setAdjustmentAuthorizedBy(event.target.value)}>
                <option value="">Não informado</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Motivo</span>
              <textarea rows={2} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} />
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
              <textarea rows={2} value={adjustmentNotes} onChange={(event) => setAdjustmentNotes(event.target.value)} />
            </label>
            <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
              <button
                type="button"
                className="form-action-primary"
                onClick={() =>
                  run(() =>
                    addAdjustmentAction(receivable.id, {
                      amount: adjustmentAmount,
                      adjustmentType,
                      reason: adjustmentReason,
                      authorizedByProfileId: adjustmentAuthorizedBy,
                      notes: adjustmentNotes,
                    }),
                  )
                }
                disabled={pending}
              >
                {pending ? "Lançando…" : "Confirmar abatimento"}
              </button>
              <button type="button" onClick={resetForms} disabled={pending}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="form-section">
        <h2>Histórico de recebimentos e abatimentos</h2>
        {history.length === 0 ? (
          <p className="helper-text">Nenhum recebimento ou abatimento registrado ainda.</p>
        ) : (
          <div className="materias-table-wrap">
            <table className="materias-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Quem recebeu/autorizou</th>
                  <th>Quem registrou</th>
                  <th>Forma/motivo</th>
                  <th>Lançado em</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => {
                  const reversed = isReversed(entry.item);
                  return (
                    <tr key={`${entry.kind}-${entry.item.id}`} className={reversed ? "subscription-row--overdue" : undefined}>
                      <td>{formatDate(entry.date)}</td>
                      <td>{entry.kind === "receipt" ? "Recebimento" : ADJUSTMENT_TYPE_LABELS[entry.item.adjustmentType]}</td>
                      <td>{formatAmount(entry.item.amount)}</td>
                      <td>
                        {entry.kind === "receipt" ? staffName(entry.item.receivedByProfileId) : staffName(entry.item.authorizedByProfileId)}
                      </td>
                      <td>{staffName(entry.item.recordedByProfileId)}</td>
                      <td>
                        {entry.kind === "receipt"
                          ? `${entry.item.paymentMethod ? PAYMENT_METHOD_LABELS[entry.item.paymentMethod] : "—"}${entry.item.reference ? ` · ${entry.item.reference}` : ""}`
                          : entry.item.reason}
                      </td>
                      <td>{formatDateTime(entry.item.recordedAt)}</td>
                      <td>
                        {reversed ? (
                          <span className="status-pill status-pill--overdue" title={entry.item.reversalReason ?? undefined}>
                            Estornado
                          </span>
                        ) : (
                          <span className="status-pill status-pill--published">Válido</span>
                        )}
                      </td>
                      <td>
                        {!reversed && !isCancelled ? (
                          <button
                            type="button"
                            className="media-remove-button"
                            onClick={() => {
                              const reason = window.prompt("Motivo do estorno:");
                              if (reason === null) return;
                              if (!reason.trim()) {
                                setError("Informe o motivo do estorno.");
                                return;
                              }
                              run(() =>
                                entry.kind === "receipt"
                                  ? reverseReceiptAction(receivable.id, entry.item.id, reason)
                                  : reverseAdjustmentAction(receivable.id, entry.item.id, reason),
                              );
                            }}
                            disabled={pending}
                          >
                            Estornar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
