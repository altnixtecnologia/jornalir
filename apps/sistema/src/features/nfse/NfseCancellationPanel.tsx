"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NFSE_CANCELLATION_JUSTIFICATION_LABELS, type NfseCancellationRequest } from "@ir/types";
import { requestCancellationAction, submitCancellationRestrictedAction, listCancellationHistoryAction } from "../../app/sistema/nfse/notas/[id]/cancellation-actions";

const JUSTIFICATION_CODES = [1, 2, 9] as const;

function statusLabel(status: NfseCancellationRequest["status"]): string {
  if (status === "pending") return "Preparada — ainda não enviada ao Sistema Nacional";
  if (status === "submitted") return "Enviada — aguardando resultado";
  if (status === "confirmed") return "Cancelamento confirmado";
  if (status === "rejected") return "Rejeitada";
  return "Resultado desconhecido (falha de rede/timeout)";
}

/**
 * Preparação do cancelamento (Item 5, Lote 2, Tarefa 5) — registra
 * motivo/justificativa (código oficial e101101/TSCodJustCanc). NUNCA
 * envia o cancelamento de fato: isso depende de homologação completa
 * da emissão, ainda não concluída (ver CancellationSubmissionNotReadyError).
 */
export function NfseCancellationPanel({
  issuedNoteId, history, restrictedMode = false,
}: { issuedNoteId: string; history: NfseCancellationRequest[]; restrictedMode?: boolean }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmRequestId, setConfirmRequestId] = useState<string | null>(null);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);
  const [justificationCode, setJustificationCode] = useState<1 | 2 | 9>(1);
  const [justificationText, setJustificationText] = useState("");
  const [error, setError] = useState("");
  const [localHistory, setLocalHistory] = useState(history);

  const hasActive = localHistory.some((item) => item.status === "pending" || item.status === "submitted" || item.status === "confirmed" || item.status === "uncertain");

  function submit(): void {
    setError("");
    startTransition(async () => {
      const result = await requestCancellationAction({ issuedNoteId, justificationCode, justificationText });
      if ("error" in result) { setError(result.error); return; }
      setLocalHistory((old) => [result.request, ...old]);
      setJustificationText("");
    });
  }

  function sendRestricted(requestId: string): void {
    setError("");
    setDispatchResult(null);
    startTransition(async () => {
      const result = await submitCancellationRestrictedAction(requestId);
      if ("error" in result) { setError(result.error); return; }
      setDispatchResult(result.status === "confirmed"
        ? "Cancelamento confirmado no ambiente de Produção Restrita."
        : result.status === "rejected"
          ? "Cancelamento rejeitado pela SEFIN restrita. Confira o histórico."
          : "Resultado INCERTO: não envie novamente. Concilie o evento na SEFIN.");
      const refreshed = await listCancellationHistoryAction(issuedNoteId);
      if ("ok" in refreshed) setLocalHistory(refreshed.requests);
      setConfirmRequestId(null);
      router.refresh();
    });
  }

  return (
    <section className="form-section">
      <h2>Cancelamento</h2>
      <p className="helper-text">
        {restrictedMode
          ? "AMBIENTE DE TESTE: o envio usa somente a SEFIN Produção Restrita, após confirmação. Sem efeitos fiscais de produção."
          : "O envio ao Sistema Nacional está BLOQUEADO nesta instalação. Aqui é possível apenas preparar e registrar motivo/justificativa localmente."}
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {dispatchResult ? <p className="helper-text" role="status">{dispatchResult}</p> : null}
      {hasActive ? (
        <p className="helper-text">Já existe uma solicitação ativa ou com resultado incerto. Confira o histórico e concilie com a SEFIN antes de qualquer novo pedido.</p>
      ) : (
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Motivo do cancelamento</span>
            <select value={justificationCode} onChange={(e) => setJustificationCode(Number(e.target.value) as 1 | 2 | 9)}>
              {JUSTIFICATION_CODES.map((code) => (
                <option key={code} value={code}>{code} — {NFSE_CANCELLATION_JUSTIFICATION_LABELS[code]}</option>
              ))}
            </select>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Justificativa (15 a 255 caracteres)</span>
            <textarea value={justificationText} onChange={(e) => setJustificationText(e.target.value)} minLength={15} maxLength={255} rows={3} />
          </label>
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={submit}
              disabled={pending || justificationText.trim().length < 15}>
              {pending ? "Registrando…" : "Preparar solicitação de cancelamento"}
            </button>
          </div>
        </div>
      )}
      <h3 style={{ marginTop: 20 }}>Histórico de solicitações</h3>
      {localHistory.length === 0 ? <p className="helper-text">Nenhuma solicitação registrada ainda.</p> : (
        <ul className="destaques-list">
          {localHistory.map((item) => (
            <li className="destaques-item" key={item.id}>
              <div className="destaques-item-body">
                <span className="materia-title">{statusLabel(item.status)}</span>
                <span className="helper-text">
                  Motivo {item.justificationCode} — {NFSE_CANCELLATION_JUSTIFICATION_LABELS[item.justificationCode]} ·{" "}
                  {new Date(item.requestedAt).toLocaleString("pt-BR")}
                </span>
                <span className="helper-text">{item.justificationText}</span>
                {item.rejectionMessage ? <span className="form-error">{item.rejectionCode}: {item.rejectionMessage}</span> : null}
                {restrictedMode && item.status === "pending" ? (
                  <div className="form-actions">
                    {confirmRequestId !== item.id ? (
                      <button type="button" className="secondary-link" disabled={pending}
                        onClick={() => setConfirmRequestId(item.id)}>
                        Enviar evento de cancelamento (Produção Restrita)
                      </button>
                    ) : (
                      <>
                        <p className="helper-text">Confirmar teste oficial de cancelamento para esta nota? O envio é irreversível no ambiente restrito.</p>
                        <button type="button" className="form-action-primary" disabled={pending}
                          onClick={() => sendRestricted(item.id)}>
                          {pending ? "Enviando…" : "Confirmar envio do evento de teste"}
                        </button>
                        <button type="button" disabled={pending} onClick={() => setConfirmRequestId(null)}>Voltar</button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
