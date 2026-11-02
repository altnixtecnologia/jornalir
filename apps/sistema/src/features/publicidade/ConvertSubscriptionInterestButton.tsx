"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertSubscriptionInterestAction } from "../../app/sistema/publicidade/solicitacoes/actions";
import { notify } from "../../lib/feedback/notify";

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix", boleto: "Boleto", credit_card: "Cartão de crédito", cash: "Dinheiro", to_define: "A definir",
};

/**
 * Bloco C (02/11/2026) — a criação de assinatura só ocorre por ação
 * expressa do operador, com confirmação clara de cliente, serviço,
 * valor e condições. O botão tem dois passos: primeiro clique mostra o
 * resumo, segundo clique confirma de verdade (confirmed=true na Server
 * Action). Bloco E (02/11/2026): a assinatura nasce "pendente de
 * formalização" — nunca ativa o serviço nem gera o primeiro título
 * financeiro automaticamente; ativação e cobrança são ações separadas,
 * feitas depois na própria tela da assinatura.
 */
export function ConvertSubscriptionInterestButton({
  requestId,
  clientName,
  amount,
  paymentPreference,
}: {
  requestId: string;
  clientName: string;
  amount: number | null;
  paymentPreference: string | null;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reviewing, setReviewing] = useState(false);

  function confirm(): void {
    startTransition(async () => {
      const result = await convertSubscriptionInterestAction(requestId, true);
      if ("error" in result) {
        notify.error("Não foi possível converter a solicitação", result.error);
        setReviewing(false);
        return;
      }
      notify.success("Assinatura criada", "A assinatura foi criada como pendente de formalização. Ative e gere a cobrança em ações separadas, na tela da assinatura.");
      router.push(`/sistema/assinaturas/${result.subscriptionId}`);
      router.refresh();
    });
  }

  if (!reviewing) {
    return (
      <div>
        <button type="button" className="form-action-primary" onClick={() => setReviewing(true)} disabled={pending}>
          Gerar assinatura
        </button>
      </div>
    );
  }

  return (
    <div className="form-section--compact" style={{ border: "1px solid var(--site-line, #ccc)", borderRadius: "8px", padding: "10px" }}>
      <p className="helper-text">
        <strong>Confirme antes de criar:</strong> cliente <strong>{clientName}</strong>, serviço{" "}
        <strong>assinatura anual do jornal impresso</strong>, valor{" "}
        <strong>{amount !== null ? money(amount) : "não definido"}</strong>, pagamento{" "}
        <strong>{paymentPreference ? PAYMENT_LABELS[paymentPreference] ?? paymentPreference : "a definir"}</strong>.
        Esta ação cria a assinatura como pendente de formalização — nenhum serviço é ativado nem título
        financeiro é gerado automaticamente. Ative e gere a cobrança depois, em ações separadas.
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
