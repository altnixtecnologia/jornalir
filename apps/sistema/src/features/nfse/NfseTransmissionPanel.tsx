"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NfseDraft, NfseIssuedNote, NfseTransmissionAttempt } from "@ir/types";
import { NFSE_TRANSMISSION_STATUS_LABELS } from "@ir/types";
import { transmitDraftAction } from "../../app/sistema/nfse/rascunhos/[id]/actions";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

/**
 * "Enviar NFS-e" (Parte 2A, item 9/14) — revisão curta + confirmação
 * explícita antes de qualquer transmissão. Nunca deixa a interface
 * sugerir que uma nota foi emitida sem resposta real: autorizada só
 * aparece depois de `issuedNote` existir de verdade; rejeitada mostra
 * os erros e mantém o rascunho editável; "uncertain" (timeout/falha de
 * rede) nunca dispara nova tentativa automática.
 */
export function NfseTransmissionPanel({
  draft,
  issuedNote,
  attempts,
  issuerConfigured,
}: {
  draft: NfseDraft;
  issuedNote: NfseIssuedNote | null;
  attempts: NfseTransmissionAttempt[];
  issuerConfigured: boolean;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [result, setResult] = useState<{ outcome: "rejected" | "uncertain"; message?: string } | null>(null);

  function handleTransmit(): void {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response = await transmitDraftAction(draft.id);
      if (response.error) {
        setError(response.error);
        return;
      }
      if (response.outcome === "authorized") {
        router.refresh();
        return;
      }
      if (response.outcome === "rejected") {
        setResult({ outcome: "rejected", message: response.rejectionMessage });
        setReviewOpen(false);
        return;
      }
      setResult({ outcome: "uncertain" });
      setReviewOpen(false);
    });
  }

  if (issuedNote) {
    return (
      <section className="form-section form-section--first">
        <h2>NFS-e emitida com sucesso</h2>
        <div className="form-grid">
          <div className="form-field">
            <span className="field-label">Número</span>
            <span>{issuedNote.nfseNumber ?? "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Chave de acesso</span>
            <span>{issuedNote.accessKey ?? "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Cliente</span>
            <span>{draft.tomador.name}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Competência</span>
            <span>{formatDate(issuedNote.competencyDate)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Valor</span>
            <span>{formatAmount(issuedNote.serviceValue)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Data/hora</span>
            <span>{issuedNote.issuedAt ? formatDateTime(issuedNote.issuedAt) : "—"}</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="form-section form-section--first">
      <h2>Transmissão</h2>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {result?.outcome === "rejected" ? (
        <div className="form-error" role="alert">
          <p>NFS-e rejeitada pelo Sistema Nacional:</p>
          <p>{result.message ?? "Motivo não detalhado."}</p>
          <p className="helper-text">O rascunho continua disponível abaixo para correção.</p>
        </div>
      ) : null}
      {result?.outcome === "uncertain" ? (
        <div className="form-error" role="alert">
          <p>Resultado incerto (falha de rede/timeout após o envio) — NÃO tentamos retransmitir automaticamente.</p>
          <p className="helper-text">Confirme manualmente antes de tentar de novo, pra nunca gerar uma DPS duplicada.</p>
        </div>
      ) : null}

      {!reviewOpen ? (
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={() => setReviewOpen(true)} disabled={pending}>
            Enviar NFS-e
          </button>
        </div>
      ) : (
        <div>
          <p className="helper-text">Confira antes de transmitir — ambiente: HOMOLOGAÇÃO.</p>
          <div className="form-grid">
            <div className="form-field">
              <span className="field-label">Cliente</span>
              <span>{draft.tomador.name}</span>
            </div>
            <div className="form-field">
              <span className="field-label">{draft.tomador.kind === "individual" ? "CPF" : "CNPJ"}</span>
              <span>{(draft.tomador.kind === "individual" ? draft.tomador.cpf : draft.tomador.cnpj) || "—"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Competência</span>
              <span>{formatDate(draft.competencyDate)}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Serviço</span>
              <span>{draft.fiscal.cTribNac || "—"}</span>
            </div>
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Descrição</span>
              <span>{draft.serviceDescription}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Valor</span>
              <span>{formatAmount(draft.serviceValue)}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Ambiente</span>
              <span>HOMOLOGAÇÃO</span>
            </div>
          </div>
          {!issuerConfigured ? <p className="form-error" role="alert">Configuração fiscal do prestador ausente — transmissão será bloqueada.</p> : null}
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={handleTransmit} disabled={pending}>
              {pending ? "Processando…" : "Confirmar envio"}
            </button>
            <button type="button" onClick={() => setReviewOpen(false)} disabled={pending}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {attempts.length > 0 ? (
        <>
          <h3 style={{ marginTop: "16px" }}>Histórico de tentativas</h3>
          <ul className="destaques-list">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="destaques-item">
                <div className="destaques-item-body">
                  <span className="materia-title">{NFSE_TRANSMISSION_STATUS_LABELS[attempt.status]}</span>
                  <span className="helper-text">
                    {formatDateTime(attempt.createdAt)}
                    {attempt.rejectionMessage ? ` · ${attempt.rejectionMessage}` : ""}
                    {attempt.responseSummary ? ` · ${attempt.responseSummary}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
