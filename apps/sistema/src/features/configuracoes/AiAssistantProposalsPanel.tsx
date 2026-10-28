"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  listAssistantProposalsAction, decideAssistantProposalAction,
} from "../../app/sistema/assistente-ir/propostas/actions";
import type { AssistantProposal } from "../../app/sistema/assistente-ir/propostas/actions";
import { notify } from "../../lib/feedback/notify";

export function AiAssistantProposalsPanel({ initial }: {
  initial: AssistantProposal[];
}): JSX.Element {
  const [items, setItems] = useState(initial);
  const [busy, startTransition] = useTransition();
  function reload(): void {
    if (busy) return;
    startTransition(async () => {
      const result = await listAssistantProposalsAction();
      if ("error" in result) notify.error("Não foi possível atualizar", result.error);
      else setItems(result.data);
    });
  }
  function decide(item: AssistantProposal, status: "approved" | "rejected"): void {
    if (busy) return;
    startTransition(async () => {
      const result = await decideAssistantProposalAction(item.id, status);
      if ("error" in result) { notify.error("Decisão não registrada", result.error); return; }
      setItems((old) => old.map((row) => row.id === item.id ? { ...row, status } : row));
      notify.success(status === "approved" ? "Sugestão aprovada" : "Sugestão recusada", status === "approved"
        ? "Aprovada para revisão humana. Nenhuma ação foi executada."
        : "Recusada. Nenhuma ação foi executada.");
    });
  }
  const statuses = { pending: "Pendente", approved: "Aprovada para revisão", rejected: "Recusada" };
  return (
    <section className="form-section form-section--first">
      <p className="helper-text">
        Aqui são avaliadas sugestões criadas pelo JoIR ou registradas por você.
        <strong> Aprovar não envia mensagens, não movimenta dinheiro, não publica matérias
        e não altera cadastros.</strong> Essas operações precisam de fluxo de execução separado e autorizado.
      </p>
      <div style={{ display: "flex", gap: 10, margin: "14px 0", flexWrap: "wrap" }}>
        <Link className="btn btn-secondary" href="/sistema/assistente-ir">Voltar à conversa</Link>
        <button type="button" className="btn btn-secondary" onClick={reload} disabled={busy}>
          {busy ? "Aguarde..." : "Atualizar propostas"}
        </button>
      </div>
      {!items.length ? <p className="helper-text">Não há sugestões registradas nesta central.</p> : null}
      <div style={{ display: "grid", gap: 12 }}>
        {items.map((item) => (
          <article className="quick-access-card" key={item.id}>
            <p className="helper-text" style={{ margin: 0 }}>
              {item.module} · {statuses[item.status]} · {new Date(item.createdAt).toLocaleString("pt-BR")}
            </p>
            <h2 style={{ marginTop: 6 }}>{item.title}</h2>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.rationale}</p>
            {item.status === "pending" ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" disabled={busy}
                  onClick={() => decide(item, "approved")}>Aprovar para revisão</button>
                <button type="button" className="btn btn-secondary" disabled={busy}
                  onClick={() => decide(item, "rejected")}>Recusar proposta</button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
