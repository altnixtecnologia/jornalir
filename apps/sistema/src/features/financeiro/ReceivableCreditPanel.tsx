"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClientCreditWithBalance } from "@ir/types";
import { RECEIVABLE_SOURCE_TYPE_LABELS } from "@ir/types";
import { applyCreditManuallyAction } from "../../app/sistema/financeiro/contas-a-receber/actions";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Aplicação MANUAL de crédito de OUTRA origem (Parte 3B.1, item 4 —
 * "permitir futuramente aplicação manual; registrar claramente a
 * transferência/aplicação"). Crédito da MESMA origem já foi aplicado
 * automaticamente na criação do título (ver "Composição do valor"
 * acima) — este painel só aparece quando existe crédito disponível de
 * outra origem do mesmo cliente, e a ação é sempre explícita.
 */
export function ReceivableCreditPanel({
  receivableId,
  receivableBalance,
  availableCredits,
}: {
  receivableId: string;
  receivableBalance: number;
  availableCredits: ClientCreditWithBalance[];
}): JSX.Element | null {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCreditId, setSelectedCreditId] = useState(availableCredits[0]?.id ?? "");
  const [amount, setAmount] = useState("");

  if (availableCredits.length === 0 || receivableBalance <= 0) return null;

  function handleApply(): void {
    setError(null);
    const parsedAmount = Number(amount.replace(",", "."));
    startTransition(async () => {
      const result = await applyCreditManuallyAction(receivableId, selectedCreditId, parsedAmount);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setAmount("");
      router.refresh();
    });
  }

  return (
    <section className="form-section">
      <h2>Crédito de outra origem disponível</h2>
      <p className="helper-text">
        Este cliente tem crédito de outra origem (nunca aplicado automaticamente aqui — aplicação manual explícita, sempre registrada).
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-grid">
        <label className="form-field">
          <span className="field-label">Crédito</span>
          <select value={selectedCreditId} onChange={(event) => setSelectedCreditId(event.target.value)}>
            {availableCredits.map((credit) => (
              <option key={credit.id} value={credit.id}>
                {RECEIVABLE_SOURCE_TYPE_LABELS[credit.sourceType]} — disponível {formatAmount(credit.balance)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="field-label">Valor a aplicar (R$)</span>
          <input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={handleApply} disabled={pending || !selectedCreditId}>
          {pending ? "Aplicando…" : "Aplicar crédito"}
        </button>
      </div>
    </section>
  );
}
