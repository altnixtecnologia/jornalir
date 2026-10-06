"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NfseCertificateType, NfseCertificateStoredStatus, NfseEnvironment, NfseIssuerConfig } from "@ir/types";
import {
  NFSE_CERTIFICATE_STORED_STATUSES,
  NFSE_CERTIFICATE_TYPE_LABELS,
  NFSE_CERTIFICATE_TYPES,
  NFSE_ENVIRONMENT_LABELS,
  NFSE_ENVIRONMENTS,
  computeCertificateEffectiveStatus,
} from "@ir/types";
import { saveIssuerConfigAction, type IssuerConfigFormInput } from "../../app/sistema/nfse/configuracoes/actions";

function toFormInput(config: Partial<NfseIssuerConfig> | undefined): IssuerConfigFormInput {
  return {
    companyName: config?.companyName ?? "",
    tradeName: config?.tradeName ?? "",
    cnpj: config?.cnpj ?? "",
    municipalRegistration: config?.municipalRegistration ?? "",
    municipality: config?.municipality ?? "",
    state: config?.state ?? "",
    ibgeCode: config?.ibgeCode ?? "",
    taxRegime: config?.taxRegime ?? "",
    specialTaxRegime: config?.specialTaxRegime ?? "",
    environment: config?.environment ?? "homologation",
    certificateType: config?.certificateType ?? "not_configured",
    certificateStatus: config?.certificateStatus ?? "not_configured",
    certificateValidUntil: config?.certificateValidUntil ?? "",
    certificateReference: config?.certificateReference ?? "",
    notes: config?.notes ?? "",
  };
}

/**
 * Configuração fiscal do emissor (Parte 1, item 4) — página única,
 * seções separadas (Prestador / Regime fiscal / Ambiente / Certificado),
 * nenhum valor assumido silenciosamente. `initialConfig` pode vir
 * vazio (sugerindo os dados da Informativo Regional só como
 * `defaultValue`, nunca persistidos até o usuário salvar).
 */
export function NfseIssuerConfigForm({ initialConfig }: { initialConfig: NfseIssuerConfig | null }): JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [input, setInput] = useState<IssuerConfigFormInput>(toFormInput(initialConfig ?? undefined));

  function set<K extends keyof IssuerConfigFormInput>(key: K, value: IssuerConfigFormInput[K]): void {
    setInput((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave(): void {
    setError(null);
    startTransition(async () => {
      const result = await saveIssuerConfigAction(input);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const effectiveCertificateStatus = computeCertificateEffectiveStatus(input.certificateStatus, input.certificateValidUntil || undefined);

  return (
    <div className="inline-form">
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {saved ? <p className="helper-text">Configuração salva.</p> : null}

      <section className="form-section form-section--first">
        <h2>Prestador</h2>
        <div className="form-grid">
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Razão social</span>
            <input type="text" value={input.companyName} onChange={(event) => set("companyName", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Nome fantasia <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.tradeName} onChange={(event) => set("tradeName", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">CNPJ</span>
            <input type="text" value={input.cnpj} onChange={(event) => set("cnpj", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Inscrição municipal</span>
            <input type="text" value={input.municipalRegistration} onChange={(event) => set("municipalRegistration", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Município</span>
            <input type="text" value={input.municipality} onChange={(event) => set("municipality", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">UF</span>
            <input type="text" maxLength={2} value={input.state} onChange={(event) => set("state", event.target.value.toUpperCase())} />
          </label>
          <label className="form-field">
            <span className="field-label">Código IBGE do município</span>
            <input type="text" value={input.ibgeCode} onChange={(event) => set("ibgeCode", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Regime/configuração fiscal</h2>
        <p className="helper-text">Exige confirmação explícita — nada aqui é assumido automaticamente.</p>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Regime tributário <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.taxRegime} onChange={(event) => set("taxRegime", event.target.value)} placeholder="ex.: Simples Nacional" />
          </label>
          <label className="form-field">
            <span className="field-label">Regime especial <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.specialTaxRegime} onChange={(event) => set("specialTaxRegime", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Ambiente</h2>
        <p className="helper-text">Nenhuma transmissão é realizada em nenhum dos dois ambientes nesta fase.</p>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Ambiente</span>
            <select value={input.environment} onChange={(event) => set("environment", event.target.value as NfseEnvironment)}>
              {NFSE_ENVIRONMENTS.map((value) => (
                <option key={value} value={value}>
                  {NFSE_ENVIRONMENT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Certificado digital</h2>
        <p className="helper-text">
          Só metadata — o arquivo (PFX/P12), senha e chave privada NUNCA são armazenados aqui. A estratégia segura de armazenamento será definida na fase da integração real.
        </p>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Tipo</span>
            <select value={input.certificateType} onChange={(event) => set("certificateType", event.target.value as NfseCertificateType)}>
              {NFSE_CERTIFICATE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {NFSE_CERTIFICATE_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Status</span>
            <select value={input.certificateStatus} onChange={(event) => set("certificateStatus", event.target.value as NfseCertificateStoredStatus)}>
              {NFSE_CERTIFICATE_STORED_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value === "not_configured" ? "Não configurado" : "Configurado"}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Validade <span className="field-optional">(opcional)</span></span>
            <input type="date" value={input.certificateValidUntil} onChange={(event) => set("certificateValidUntil", event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Referência segura <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.certificateReference} onChange={(event) => set("certificateReference", event.target.value)} />
          </label>
        </div>
        <p className="helper-text">Status efetivo: {effectiveCertificateStatus === "expired" ? "Expirado" : effectiveCertificateStatus === "configured" ? "Configurado" : "Não configurado"}.</p>
      </section>

      <section className="form-section">
        <h2>Observações</h2>
        <textarea rows={3} value={input.notes} onChange={(event) => set("notes", event.target.value)} />
      </section>

      <section className="form-section">
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={handleSave} disabled={pending}>
            {pending ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      </section>
    </div>
  );
}
