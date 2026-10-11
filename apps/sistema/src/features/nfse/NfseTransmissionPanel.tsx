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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PreviewStage = "idle" | "preparing" | "transmitting";

const PREVIEW_STAGE_LABELS: Record<PreviewStage, string> = {
  idle: "Processando…",
  preparing: "Preparando…",
  transmitting: "Transmitindo…",
};

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
  previewMode = false,
}: {
  draft: NfseDraft;
  issuedNote: NfseIssuedNote | null;
  attempts: NfseTransmissionAttempt[];
  issuerConfigured: boolean;
  previewMode?: boolean;
}): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [result, setResult] = useState<{ outcome: "rejected" | "uncertain"; message?: string } | null>(null);
  const [stage, setStage] = useState<PreviewStage>("idle");
  const [copied, setCopied] = useState(false);

  function handleTransmit(): void {
    setError(null);
    setResult(null);
    startTransition(async () => {
      // Simulação "Preparando → Transmitindo" só visual (item 3) — só em
      // preview; em produção o resultado real chega sem essa encenação,
      // nunca escondendo/retardando um bloqueio real de transmissão.
      if (previewMode) {
        setStage("preparing");
        await delay(500);
        setStage("transmitting");
        await delay(700);
      }
      const response = await transmitDraftAction(draft.id);
      setStage("idle");
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

  function handleCopyAccessKey(accessKey: string): void {
    navigator.clipboard
      .writeText(accessKey)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  }

  if (issuedNote) {
    const xml = issuedNote.nfseXml ?? issuedNote.signedDpsXml;
    return (
      <>
        <section className="form-section form-section--first">
          <h2>NFS-e emitida com sucesso</h2>
          <div className="form-grid">
            <div className="form-field">
              <span className="field-label">Número</span>
              <span>{issuedNote.nfseNumber ?? "—"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Status</span>
              <span className="status-pill status-pill--published">Autorizada</span>
            </div>
            <div className="form-field">
              <span className="field-label">Chave de acesso</span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {issuedNote.accessKey ?? "—"}
                {issuedNote.accessKey ? (
                  <button type="button" onClick={() => handleCopyAccessKey(issuedNote.accessKey!)} className="secondary-link">
                    {copied ? "Copiado ✓" : "Copiar chave"}
                  </button>
                ) : null}
              </span>
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
              <span className="field-label">Data/hora da emissão</span>
              <span>{issuedNote.issuedAt ? formatDateTime(issuedNote.issuedAt) : "—"}</span>
            </div>
          </div>
        </section>

        <section className="form-section">
          <h2>Tomador</h2>
          <div className="form-grid">
            <div className="form-field">
              <span className="field-label">Nome</span>
              <span>{draft.tomador.name}</span>
            </div>
            <div className="form-field">
              <span className="field-label">{draft.tomador.kind === "individual" ? "CPF" : "CNPJ"}</span>
              <span>{(draft.tomador.kind === "individual" ? draft.tomador.cpf : draft.tomador.cnpj) || "—"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Município</span>
              <span>{draft.tomador.city ? `${draft.tomador.city}/${draft.tomador.state ?? "—"}` : "—"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">E-mail</span>
              <span>{draft.tomador.email ?? "—"}</span>
            </div>
          </div>
        </section>

        <section className="form-section">
          <h2>Serviço e tributação</h2>
          <div className="form-grid">
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Descrição</span>
              <span>{draft.serviceDescription}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Código de tributação nacional</span>
              <span>{draft.fiscal.cTribNac ?? "—"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Município de prestação</span>
              <span>{draft.fiscal.locationMunicipality ?? "—"}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Regime tributário especial</span>
              <span>{draft.fiscal.specialTaxRegime ?? "—"}</span>
            </div>
          </div>
        </section>

        <section className="form-section">
          <h2>Retorno fiscal</h2>
          <div className="form-grid">
            <div className="form-field">
              <span className="field-label">Identificação da DPS</span>
              <span>{issuedNote.dpsId}</span>
            </div>
            <div className="form-field">
              <span className="field-label">Ambiente</span>
              <span>{issuedNote.environment === "homologation" ? "Homologação" : "Produção"}</span>
            </div>
          </div>
          {xml ? (
            <details style={{ marginTop: "12px" }}>
              <summary>Ver XML (estrutura/assinatura — nunca expõe chave privada/certificado)</summary>
              <pre className="helper-text" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: "8px" }}>
                {xml}
              </pre>
            </details>
          ) : null}
          <p className="helper-text" style={{ marginTop: "12px" }}>
            DANFSe estará disponível após a integração completa de transmissão. Cancelamento e envio por e-mail ainda não
            estão implementados nesta fase.
          </p>
        </section>

        {attempts.length > 0 ? (
          <section className="form-section">
            <h2>Histórico de tentativas</h2>
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
          </section>
        ) : null}
      </>
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
            {previewMode ? "Emitir NFS-e (demonstração)" : "Enviar NFS-e"}
          </button>
        </div>
      ) : (
        <div>
          <p className="helper-text">
            Confira antes de transmitir — ambiente: HOMOLOGAÇÃO.
            {previewMode ? " Modo demonstração: nenhuma transmissão real será feita." : ""}
          </p>
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
              {pending ? (previewMode ? PREVIEW_STAGE_LABELS[stage] : "Processando…") : previewMode ? "Confirmar emissão (demonstração)" : "Confirmar envio"}
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
