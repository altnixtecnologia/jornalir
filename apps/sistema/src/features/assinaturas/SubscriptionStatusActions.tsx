"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Subscription } from "@ir/types";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { cancelSubscriptionAction, reactivateSubscriptionAction, suspendSubscriptionAction } from "../../app/sistema/assinaturas/actions";
import { notify } from "../../lib/feedback/notify";

/**
 * Ações de transição de status na própria página de detalhe — nunca
 * redirecionam; ficam na mesma tela. `router.refresh()` depois de cada
 * ação descarta o Router Cache da página (mesmo padrão de
 * ArticleForm.handleBack) pra mostrar o status atualizado sem precisar
 * de hard refresh. Cancelada é estado final — este componente não
 * mostra nenhuma ação quando a assinatura já está cancelada. Cancelar é a
 * única ação destrutiva/irreversível daqui — usa o mesmo `ConfirmDialog`
 * (dialog nativo) já aprovado em Cadastros/Aniversariantes, em vez do
 * formulário inline que havia antes.
 */
export function SubscriptionStatusActions({ subscription }: { subscription: Subscription }): JSX.Element | null {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  function runAction(
    action: () => Promise<{ error: string } | void>,
    feedback: { successTitle: string; successDescription: string; errorTitle: string },
  ): void {
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result) {
        notify.error(feedback.errorTitle, result.error);
        return;
      }
      setShowCancelConfirm(false);
      notify.success(feedback.successTitle, feedback.successDescription);
      router.refresh();
    });
  }

  if (subscription.status === "cancelled") return null;

  return (
    <div className="form-section form-section--compact">
      <h2>Ações</h2>
      <div className="form-actions">
        {subscription.status === "active" ? (
          <button type="button" onClick={() => runAction(
            () => suspendSubscriptionAction(subscription.id),
            { successTitle: "Assinatura suspensa", successDescription: "A assinatura " + subscription.reference + " foi suspensa.", errorTitle: "Não foi possível suspender" },
          )} disabled={pending}>
            Suspender
          </button>
        ) : null}
        {subscription.status === "suspended" ? (
          <button type="button" onClick={() => runAction(
            () => reactivateSubscriptionAction(subscription.id),
            { successTitle: "Assinatura reativada", successDescription: "A assinatura " + subscription.reference + " foi reativada.", errorTitle: "Não foi possível reativar" },
          )} disabled={pending}>
            Reativar
          </button>
        ) : null}
        <button
          type="button"
          className="media-remove-button"
          onClick={() => {
            setCancellationReason("");
            setShowCancelConfirm(true);
          }}
          disabled={pending}
        >
          Cancelar assinatura
        </button>
      </div>

      <ConfirmDialog
        open={showCancelConfirm}
        title={`Cancelar assinatura "${subscription.reference}"?`}
        description={
          <>
            <p>Cancelada é definitiva — para retomar o serviço depois, será necessário criar uma nova assinatura.</p>
            <label className="form-field" style={{ marginTop: "10px" }}>
              <span className="field-label">Motivo do cancelamento <span className="field-optional">(opcional)</span></span>
              <textarea rows={3} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} />
            </label>
          </>
        }
        confirmLabel={pending ? "Cancelando…" : "Confirmar cancelamento"}
        onConfirm={() => runAction(
          () => cancelSubscriptionAction(subscription.id, cancellationReason),
          { successTitle: "Assinatura cancelada", successDescription: "A assinatura " + subscription.reference + " foi cancelada.", errorTitle: "Não foi possível cancelar" },
        )}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  );
}
