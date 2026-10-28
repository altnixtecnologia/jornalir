"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertSubscriptionInterestAction } from "../../app/sistema/publicidade/solicitacoes/actions";
import { notify } from "../../lib/feedback/notify";

export function ConvertSubscriptionInterestButton({ requestId }: { requestId: string }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function convert(): void {
    startTransition(async () => {
      const result = await convertSubscriptionInterestAction(requestId);
      if ("error" in result) {
        notify.error("Não foi possível converter a solicitação", result.error);
        return;
      }
      notify.success("Assinatura criada", "A solicitação foi convertida em assinatura e o financeiro foi gerado.");
      router.push(`/sistema/assinaturas/${result.subscriptionId}`);
      router.refresh();
    });
  }

  return (
    <div>
      <button type="button" className="form-action-primary" onClick={convert} disabled={pending}>
        {pending ? "Convertendo..." : "Criar assinatura + financeiro"}
      </button>
    </div>
  );
}
