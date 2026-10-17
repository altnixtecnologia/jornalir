"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  NfseAdministrativeTaxRegime,
  NfseCertificateType,
  NfseCertificateStoredStatus,
  NfseEnvironment,
  NfseIbsCbsSimplesNacionalRegime,
  NfseIssuerConfig,
  NfseSimplesNacionalOption,
  NfseSpecialTaxRegimeCode,
} from "@ir/types";
import {
  NFSE_ADMINISTRATIVE_TAX_REGIMES,
  NFSE_ADMINISTRATIVE_TAX_REGIME_LABELS,
  NFSE_CERTIFICATE_STORED_STATUSES,
  NFSE_CERTIFICATE_TYPE_LABELS,
  NFSE_CERTIFICATE_TYPES,
  NFSE_ENVIRONMENT_LABELS,
  NFSE_ENVIRONMENTS,
  NFSE_IBS_CBS_SIMPLES_NACIONAL_REGIMES,
  NFSE_IBS_CBS_SIMPLES_NACIONAL_REGIME_LABELS,
  NFSE_SIMPLES_NACIONAL_OPTIONS,
  NFSE_SIMPLES_NACIONAL_OPTION_LABELS,
  NFSE_SPECIAL_TAX_REGIME_CODES,
  NFSE_SPECIAL_TAX_REGIME_CODE_LABELS,
  computeCertificateEffectiveStatus,
  isIbsCbsSimplesRegimeApplicable,
} from "@ir/types";
import { NfseCertificatePanel } from "./NfseCertificatePanel";
import { saveIssuerConfigAction, type IssuerConfigFormInput } from "../../app/sistema/nfse/configuracoes/actions";

function toFormInput(config: Partial<NfseIssuerConfig> | undefined): IssuerConfigFormInput {
  return {
    companyName: config?.companyName ?? "",
    tradeName: config?.tradeName ?? "",
    cnpj: config?.cnpj ?? "",
    municipalRegistration: config?.municipalRegistration ?? "",
    stateRegistration: config?.stateRegistration ?? "",
    municipality: config?.municipality ?? "",
    state: config?.state ?? "",
    ibgeCode: config?.ibgeCode ?? "",
    administrativeTaxRegime: config?.administrativeTaxRegime ?? "",
    simplesNacionalOption: config?.simplesNacionalOption ?? "",
    specialTaxRegimeCode: config?.specialTaxRegimeCode ?? "",
    ibsCbsSimplesNacionalRegime: config?.ibsCbsSimplesNacionalRegime ?? "",
    environment: config?.environment ?? "homologation",
    certificateType: config?.certificateType ?? "not_configured",
    certificateStatus: config?.certificateStatus ?? "not_configured",
    certificateValidUntil: config?.certificateValidUntil ?? "",
    certificateReference: config?.certificateReference ?? "",
    dpsSeries: config?.dpsSeries ?? "",
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
export function NfseIssuerConfigForm({ initialConfig, encryptionReady }: { initialConfig: NfseIssuerConfig | null; encryptionReady: boolean }): JSX.Element {
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
        <div className="nfse-config-row nfse-issuer-row-1">
          <label className="form-field">
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
        </div>
        <div className="nfse-config-row nfse-issuer-row-2">
          <label className="form-field">
            <span className="field-label">Inscrição Estadual <span className="field-optional">(opcional)</span></span>
            <input type="text" value={input.stateRegistration} onChange={(event) => set("stateRegistration", event.target.value)} />
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
        </div>
        <div className="nfse-config-row nfse-issuer-row-3">
          <label className="form-field">
            <span className="field-label">Código IBGE do município</span>
            <input type="text" value={input.ibgeCode} onChange={(event) => set("ibgeCode", event.target.value)} />
          </label>
        </div>
        <p className="helper-text" style={{ marginTop: "0.75rem" }}>
          Inscrição Estadual é só dado cadastral/fiscal — nunca incluída automaticamente no XML da DPS sem confirmação de que o leiaute oficial vigente a exige.
        </p>
      </section>

      <section className="form-section">
        <h2>Regime/configuração fiscal</h2>
        <p className="helper-text">Exige confirmação explícita — nada aqui é assumido automaticamente.</p>
        <div className="nfse-config-row nfse-regime-row">
          <label className="form-field">
            <span className="field-label">Regime tributário <span className="field-optional">(administrativo)</span></span>
            <select value={input.administrativeTaxRegime} onChange={(event) => set("administrativeTaxRegime", event.target.value as NfseAdministrativeTaxRegime | "")}>
              <option value="">Não escolhido</option>
              {NFSE_ADMINISTRATIVE_TAX_REGIMES.map((value) => (
                <option key={value} value={value}>
                  {NFSE_ADMINISTRATIVE_TAX_REGIME_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Situação no Simples Nacional</span>
            <select
              value={input.simplesNacionalOption}
              onChange={(event) => {
                const value = event.target.value as NfseSimplesNacionalOption | "";
                set("simplesNacionalOption", value);
                if (!isIbsCbsSimplesRegimeApplicable(value || undefined)) set("ibsCbsSimplesNacionalRegime", "");
              }}
            >
              <option value="">Não escolhido</option>
              {NFSE_SIMPLES_NACIONAL_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {NFSE_SIMPLES_NACIONAL_OPTION_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Regime especial de tributação</span>
            <select value={input.specialTaxRegimeCode} onChange={(event) => set("specialTaxRegimeCode", event.target.value as NfseSpecialTaxRegimeCode | "")}>
              <option value="">Não escolhido</option>
              {NFSE_SPECIAL_TAX_REGIME_CODES.map((value) => (
                <option key={value} value={value}>
                  {NFSE_SPECIAL_TAX_REGIME_CODE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          {(() => {
            const applicable = isIbsCbsSimplesRegimeApplicable(input.simplesNacionalOption || undefined);
            return (
              <label className="form-field">
                <span className="field-label">Regime IBS/CBS no Simples</span>
                <select
                  value={applicable ? input.ibsCbsSimplesNacionalRegime : ""}
                  disabled={!applicable}
                  onChange={(event) => set("ibsCbsSimplesNacionalRegime", event.target.value as NfseIbsCbsSimplesNacionalRegime | "")}
                >
                  <option value="">{applicable ? "Não escolhido" : "Não aplicável"}</option>
                  {NFSE_IBS_CBS_SIMPLES_NACIONAL_REGIMES.map((value) => (
                    <option key={value} value={value}>
                      {NFSE_IBS_CBS_SIMPLES_NACIONAL_REGIME_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
            );
          })()}
        </div>
        <p className="helper-text" style={{ marginTop: "0.75rem" }}>
          "Regime tributário" é só administrativo/descritivo. Os 3 campos à direita são exigidos pelo Sistema Nacional pra identificar a situação tributária do prestador (regApIBSCBSSN só se aplica quando optante — MEI/ME-EPP/Pendente) — sem eles, a emissão não fica pronta.
        </p>
      </section>

      <section className="form-section">
        <h2>Ambiente e emissão</h2>
        <p className="helper-text">Nenhuma transmissão real é realizada em nenhum ambiente nesta fase.</p>
        <div className="nfse-config-row nfse-ambiente-row">
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
          <label className="form-field">
            <span className="field-label">Série da DPS <span className="field-optional">(opcional por ora)</span></span>
            <input type="text" inputMode="numeric" maxLength={5} value={input.dpsSeries} onChange={(event) => set("dpsSeries", event.target.value)} placeholder="ex.: 1" />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Certificado digital</h2>
        <p className="helper-text">
          Upload do PFX/P12 real — a senha só é usada no servidor pra abrir o arquivo e NUNCA é armazenada (nem em texto, nem em log). Só a chave privada/certificado, já extraídos, ficam guardados — criptografados (AES-256-GCM).
        </p>
        <NfseCertificatePanel issuerCnpj={input.cnpj} encryptionReady={encryptionReady} />
        <p className="helper-text" style={{ marginTop: "0.75rem" }}>
          Campos legados abaixo (tipo/status/validade/referência) — mantidos só por compatibilidade com configurações antigas; o upload acima é a fonte de verdade a partir de agora.
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
