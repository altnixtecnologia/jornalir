"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@ir/types";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@ir/types";
import type { StaffOption } from "../../providers/supabase/staffRepository.supabase";
import { payCompositionAction } from "../../app/sistema/financeiro/contas-a-receber/actions";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Pagamento pela composição (Parte 3B.1, ajuste de integridade item 2)
 * — ação PADRÃO quando existe saldo anterior em aberto da mesma
 * origem: SEMPRE quita o título mais antigo primeiro (ver
 * payCompositionAction/ReceivableService.payAcrossReceivables). Só
 * aparece quando `priorOpenIds` não é vazio — sem saldo anterior, o
 * recebimento comum (ReceivableActionsPanel) já é suficiente.
 */
export function CompositionPaymentPanel({
  receivableIdsOldestFirst,
  totalDue,
  staff,
}: {
  receivableIdsOldestFirst: string[];
  totalDue: number;
  staff: StaffOption[];
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(totalDue > 0 ? totalDue.toFixed(2).replace(".", ",") : "");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receivedBy, setReceivedBy] = useState("");

  function handleConfirm(): void {
    setError(null);
    startTransition(async () => {
      const result = await payCompositionAction(receivableIdsOldestFirst, {
        amount,
        receivedAt,
        paymentMethod,
        reference,
        notes,
        receivedByProfileId: receivedBy,
      });
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={() => setOpen(true)}>
          Registrar recebimento (quita o mais antigo primeiro)
        </button>
      </div>
    );
  }

  return (
    <div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <p className="helper-text">
        Este pagamento é distribuído automaticamente entre os {receivableIdsOldestFirst.length} título(s) acima, SEMPRE começando pelo mais antigo. Se sobrar valor depois de quitar todos, o excedente vira crédito desta mesma origem.
      </p>
      <div className="form-grid">
        <label className="form-field">
          <span className="field-label">Valor recebido (R$)</span>
          <input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="form-field">
          <span className="field-label">Data do recebimento</span>
          <input type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} />
        </label>
        <label className="form-field">
          <span className="field-label">Forma de pagamento <span className="field-optional">(opcional)</span></span>
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod | "")}>
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
          <input type="text" value={reference} onChange={(event) => setReference(event.target.value)} />
        </label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span className="field-label">Observações <span className="field-optional">(opcional)</span></span>
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={handleConfirm} disabled={pending}>
          {pending ? "Registrando…" : "Confirmar recebimento"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
