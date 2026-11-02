"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertAdvertisingInterestAction } from "../../app/sistema/publicidade/solicitacoes/actions";
import { notify } from "../../lib/feedback/notify";

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Bloco C (02/11/2026) — mesma confirmação explícita em dois passos de
 * ConvertSubscriptionInterestButton, antes de criar proposta/assinatura. */
export function ConvertAdvertisingInterestButton({
  requestId,
  isMixed,
  clientName,
  approvedTotal,
}: {
  requestId: string;
  isMixed: boolean;
  clientName: string;
  approvedTotal: number | null;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reviewing, setReviewing] = useState(false);

  function confirm(): void {
    startTransition(async () => {
      const result = await convertAdvertisingInterestAction(requestId, true);
      if ("error" in result) {
        notify.error("Não foi possível converter a solicitação", result.error);
        setReviewing(false);
        return;
      }
      notify.success(
        "Proposta criada",
        isMixed
          ? "A solicitação foi convertida: assinatura criada como pendente de formalização (ative e gere a cobrança depois, em ações separadas) e proposta comercial criada para a parte de publicidade."
          : "A solicitação foi convertida em proposta comercial.",
      );
      router.push(`/sistema/publicidade/propostas/${result.proposalId}`);
      router.refresh();
    });
  }

  if (!reviewing) {
    return (
      <div>
        <button type="button" className="form-action-primary" onClick={() => setReviewing(true)} disabled={pending}>
          {isMixed ? "Criar assinatura + proposta" : "Criar proposta comercial"}
        </button>
      </div>
    );
  }

  return (
    <div className="form-section--compact" style={{ border: "1px solid var(--site-line, #ccc)", borderRadius: "8px", padding: "10px" }}>
      <p className="helper-text">
        <strong>Confirme antes de criar:</strong> cliente <strong>{clientName}</strong>, valor aprovado{" "}
        <strong>{approvedTotal !== null ? money(approvedTotal) : "não definido"}</strong>.
        {isMixed ? " Esta ação cria a assinatura (pendente de formalização, sem ativar serviço nem gerar cobrança) e a proposta comercial de publicidade." : " Esta ação cria a proposta comercial."}
      </p>
      <div className="materias-toolbar-actions">
        <button type="button" className="form-action-primary" onClick={confirm} disabled={pending}>
          {pending ? "Confirmando..." : "Confirmar e criar"}
        </button>
        <button type="button" className="secondary-link" onClick={() => setReviewing(false)} disabled={pending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
