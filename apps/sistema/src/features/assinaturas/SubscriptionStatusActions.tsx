"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Subscription } from "@ir/types";
import { cancelSubscriptionAction, reactivateSubscriptionAction, suspendSubscriptionAction } from "../../app/sistema/assinaturas/actions";

/**
 * Ações de transição de status na própria página de detalhe — nunca
 * redirecionam; ficam na mesma tela. `router.refresh()` depois de cada
 * ação descarta o Router Cache da página (mesmo padrão de
 * ArticleForm.handleBack) pra mostrar o status atualizado sem precisar
 * de hard refresh. Cancelada é estado final — este componente não
 * mostra nenhuma ação quando a assinatura já está cancelada.
 */
export function SubscriptionStatusActions({ subscription }: { subscription: Subscription }): JSX.Element | null {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  function runAction(action: () => Promise<{ error: string } | void>): void {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setShowCancelForm(false);
      router.refresh();
    });
  }

  if (subscription.status === "cancelled") return null;

  return (
    <div className="form-section form-section--compact">
      <h2>Ações</h2>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions">
        {subscription.status === "active" ? (
          <button type="button" onClick={() => runAction(() => suspendSubscriptionAction(subscription.id))} disabled={pending}>
            Suspender
          </button>
        ) : null}
        {subscription.status === "suspended" ? (
          <button type="button" onClick={() => runAction(() => reactivateSubscriptionAction(subscription.id))} disabled={pending}>
            Reativar
          </button>
        ) : null}
        {!showCancelForm ? (
          <button type="button" className="media-remove-button" onClick={() => setShowCancelForm(true)} disabled={pending}>
            Cancelar assinatura
          </button>
        ) : null}
      </div>

      {showCancelForm ? (
        <div className="form-grid" style={{ marginTop: "12px" }}>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Motivo do cancelamento <span className="field-optional">(opcional)</span></span>
            <textarea rows={3} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="media-remove-button"
              onClick={() => runAction(() => cancelSubscriptionAction(subscription.id, cancellationReason))}
              disabled={pending}
            >
              {pending ? "Cancelando…" : "Confirmar cancelamento"}
            </button>
            <button type="button" onClick={() => setShowCancelForm(false)} disabled={pending}>
              Voltar
            </button>
          </div>
          <p className="helper-text" style={{ gridColumn: "1 / -1" }}>
            Cancelada é definitiva — para retomar o serviço depois, será necessário criar uma nova assinatura.
          </p>
        </div>
      ) : null}
    </div>
  );
}
