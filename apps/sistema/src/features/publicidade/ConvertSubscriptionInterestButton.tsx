"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertSubscriptionInterestAction } from "../../app/sistema/publicidade/solicitacoes/actions";

export function ConvertSubscriptionInterestButton({ requestId }: { requestId: string }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function convert(): void {
    setError(null);
    startTransition(async () => {
      const result = await convertSubscriptionInterestAction(requestId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/sistema/assinaturas/${result.subscriptionId}`);
      router.refresh();
    });
  }

  return (
    <div>
      <button type="button" className="form-action-primary" onClick={convert} disabled={pending}>
        {pending ? "Convertendo..." : "Criar assinatura + financeiro"}
      </button>
      {error ? <p className="form-error" style={{ marginTop: 6 }}>{error}</p> : null}
    </div>
  );
}
