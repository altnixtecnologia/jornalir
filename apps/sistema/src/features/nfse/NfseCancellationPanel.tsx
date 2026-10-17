"use client";

import { useState, useTransition } from "react";
import { NFSE_CANCELLATION_JUSTIFICATION_LABELS, type NfseCancellationRequest } from "@ir/types";
import { requestCancellationAction } from "../../app/sistema/nfse/notas/[id]/cancellation-actions";

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
  issuedNoteId, history,
}: { issuedNoteId: string; history: NfseCancellationRequest[] }): JSX.Element {
  const [pending, startTransition] = useTransition();
  const [justificationCode, setJustificationCode] = useState<1 | 2 | 9>(1);
  const [justificationText, setJustificationText] = useState("");
  const [error, setError] = useState("");
  const [localHistory, setLocalHistory] = useState(history);

  const hasActive = localHistory.some((item) => item.status === "pending" || item.status === "submitted" || item.status === "confirmed");

  function submit(): void {
    setError("");
    startTransition(async () => {
      const result = await requestCancellationAction({ issuedNoteId, justificationCode, justificationText });
      if ("error" in result) { setError(result.error); return; }
      setLocalHistory((old) => [result.request, ...old]);
      setJustificationText("");
    });
  }

  return (
    <section className="form-section">
      <h2>Cancelamento</h2>
      <p className="helper-text">
        O envio real do cancelamento ao Sistema Nacional ainda não está disponível nesta fase (depende de homologação completa da
        emissão). Esta tela só PREPARA e registra a solicitação — motivo, justificativa e histórico — localmente.
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {hasActive ? (
        <p className="helper-text">Já existe uma solicitação ativa para esta NFS-e — veja o histórico abaixo.</p>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
