"use client";

import { useState, useTransition } from "react";
import { NFSE_INITIAL_SERVICE_REFERENCE, NFSE_SUGGESTED_ISSUER_DEFAULTS, type NfseMunicipalParametersResult } from "@ir/types";
import { querySaoJoaoDoSulParametersAction } from "../../app/sistema/nfse/configuracoes/parametrizacao-actions";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

function currentLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCompetence(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Resumo legível dos campos mais relevantes — o payload inteiro
 * continua disponível no "Resposta técnica para diagnóstico" abaixo.
 * Nunca reinterpreta os campos como regra fiscal fixa (item 16): só
 * reexibe o que o ADN devolveu, identificado como dado do serviço
 * oficial.
 */
function RelevantResponse({ result }: { result: NfseMunicipalParametersResult }): JSX.Element {
  const agreement = objectValue(result.agreement.parametrosConvenio) ?? result.agreement;
  const rates = objectValue(result.serviceParameters.aliquotas) ?? result.serviceParameters;
  return (
    <div className="form-grid" style={{ marginTop: "0.75rem" }}>
      <div className="form-field">
        <span className="field-label">Convênio municipal</span>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}>{JSON.stringify(agreement, null, 2)}</pre>
      </div>
      <div className="form-field">
        <span className="field-label">Serviço {result.serviceCode}</span>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}>{JSON.stringify(rates, null, 2)}</pre>
      </div>
    </div>
  );
}

/**
 * Consulta real ao ADN — convênio + alíquota pra São João do Sul
 * (Parte 2C, item 3.2). Nunca mostra um resultado de teste/mock como
 * consulta concluída: todo `result` exibido aqui vem da Server Action
 * (`querySaoJoaoDoSulParametersAction`), que só devolve `ok: true`
 * depois de uma resposta HTTP real do ADN.
 */
export function NfseMunicipalParametersPanel(): JSX.Element {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<NfseMunicipalParametersResult | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [lastAttemptAt, setLastAttemptAt] = useState<string | null>(null);
  const [competenceDate, setCompetenceDate] = useState(currentLocalDate);

  function query(): void {
    setError(null);
    startTransition(async () => {
      const response = await querySaoJoaoDoSulParametersAction(competenceDate);
      setLastAttemptAt(new Date().toISOString());
      if (!response.ok) {
        setResult(null);
        setError({ code: response.code, message: response.error });
        return;
      }
      setResult(response.data);
    });
  }

  return (
    <section className="form-section">
      <h2>Integração NFS-e Nacional</h2>
      <div className="form-grid">
        <div className="form-field">
          <span className="field-label">Ambiente</span>
          <span>Produção Restrita</span>
          <span className="helper-text">Produção permanece bloqueada.</span>
        </div>
        <div className="form-field">
          <span className="field-label">Prestador</span>
          <span>Informativo Regional LTDA</span>
          <span>CNPJ 23.970.969/0001-90 · IM 1000546</span>
          <span>São João do Sul/SC — 4216404</span>
        </div>
        <div className="form-field">
          <span className="field-label">Serviço de referência</span>
          <span>{NFSE_INITIAL_SERVICE_REFERENCE.name} · {NFSE_INITIAL_SERVICE_REFERENCE.nationalTaxCode}</span>
          <span className="helper-text">NBS {NFSE_INITIAL_SERVICE_REFERENCE.nbs}; nenhuma alíquota ou regra é presumida.</span>
        </div>
      </div>

      <div className="form-grid" style={{ marginTop: "1rem" }}>
        <label className="form-field">
          <span className="field-label">Competência da consulta</span>
          <input type="date" value={competenceDate} onChange={(event) => setCompetenceDate(event.target.value)} required />
          <span className="helper-text">A data atual é apenas o valor inicial. Informe aqui a competência real quando a consulta estiver ligada a uma DPS.</span>
        </label>
      </div>

      <div className="form-actions" style={{ marginTop: "1rem" }}>
        <button type="button" className="form-action-primary" onClick={query} disabled={pending || !competenceDate}>
          {pending ? "Consultando…" : "Consultar São João do Sul"}
        </button>
      </div>

      {error ? <p className="form-error" role="alert">{error.code}: {error.message}</p> : null}
      {lastAttemptAt ? <p className="helper-text">Última tentativa: {formatDateTime(lastAttemptAt)}.</p> : null}
      {result ? (
        <div style={{ marginTop: "1rem" }}>
          <p className="helper-text">Consulta concluída em {formatDateTime(result.fetchedAt)} para a competência {formatCompetence(result.competence)}.</p>
          <RelevantResponse result={result} />
          <details className="more-options" style={{ marginTop: "1rem" }}>
            <summary>Resposta técnica para diagnóstico</summary>
            <div className="more-options-panel">
              <pre style={{ maxHeight: "24rem", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
