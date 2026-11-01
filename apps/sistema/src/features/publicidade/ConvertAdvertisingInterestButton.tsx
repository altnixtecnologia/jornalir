"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertAdvertisingInterestAction } from "../../app/sistema/publicidade/solicitacoes/actions";
import { notify } from "../../lib/feedback/notify";

export function ConvertAdvertisingInterestButton({
  requestId,
  isMixed,
}: {
  requestId: string;
  isMixed: boolean;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function convert(): void {
    startTransition(async () => {
      const result = await convertAdvertisingInterestAction(requestId);
      if ("error" in result) {
        notify.error("Não foi possível converter a solicitação", result.error);
        return;
      }
      notify.success(
        "Proposta criada",
        isMixed
          ? "A solicitação foi convertida: assinatura + financeiro gerados e proposta comercial criada para a parte de publicidade."
          : "A solicitação foi convertida em proposta comercial.",
      );
      router.push(`/sistema/publicidade/propostas/${result.proposalId}`);
      router.refresh();
    });
  }

  return (
    <div>
      <button type="button" className="form-action-primary" onClick={convert} disabled={pending}>
        {pending ? "Convertendo..." : isMixed ? "Criar assinatura + proposta" : "Criar proposta comercial"}
      </button>
    </div>
  );
}
