"use client";

import { useState, useTransition } from "react";
import { updateBillingProviderSettingsAction } from "../../app/sistema/configuracoes/cobrancas/actions";

export interface BillingProviderSettingsValues {
  environment: "sandbox" | "production";
  enabled: boolean;
  allowPix: boolean;
  allowBoleto: boolean;
  allowCreditCard: boolean;
  allowCash: boolean;
  defaultDueDays: number;
  financeWhatsapp: string;
  sandboxKeyConfigured: boolean;
  productionKeyConfigured: boolean;
  webhookTokenConfigured: boolean;
}

export function BillingProviderSettingsPanel({ values }: { values: BillingProviderSettingsValues }): JSX.Element {
  const [environment, setEnvironment] = useState(values.environment);
  const [enabled, setEnabled] = useState(values.enabled);
  const [allowPix, setAllowPix] = useState(values.allowPix);
  const [allowBoleto, setAllowBoleto] = useState(values.allowBoleto);
  const [allowCreditCard, setAllowCreditCard] = useState(values.allowCreditCard);
  const [allowCash, setAllowCash] = useState(values.allowCash);
  const [defaultDueDays, setDefaultDueDays] = useState(String(values.defaultDueDays));
  const [financeWhatsapp, setFinanceWhatsapp] = useState(values.financeWhatsapp);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedKeyConfigured = environment === "sandbox" ? values.sandboxKeyConfigured : values.productionKeyConfigured;

  function save(): void {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await updateBillingProviderSettingsAction({
        environment,
        enabled,
        allowPix,
        allowBoleto,
        allowCreditCard,
        allowCash,
        defaultDueDays,
        financeWhatsapp,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMessage("Configuração de cobranças atualizada.");
    });
  }

  return (
    <>
      <section className="form-section form-section--first">
        <h2>Asaas</h2>
        <p className="helper-text">
          Configuração central do Financeiro. Solicitações do site continuam passando por análise antes de qualquer cobrança.
        </p>

        <div className="form-grid" style={{ marginTop: 14 }}>
          <label className="form-field">
            <span className="field-label">Ambiente</span>
            <select value={environment} onChange={(e) => setEnvironment(e.target.value as "sandbox" | "production")}>
              <option value="sandbox">Sandbox / testes</option>
              <option value="production">Produção</option>
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Prazo padrão</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={0} max={60} value={defaultDueDays} onChange={(e) => setDefaultDueDays(e.target.value)} />
              <span className="helper-text">dias</span>
            </div>
          </label>
          <label className="form-field">
            <span className="field-label">WhatsApp do Financeiro</span>
            <input value={financeWhatsapp} onChange={(e) => setFinanceWhatsapp(e.target.value)} placeholder="5548999999999" />
          </label>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
          <label><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Habilitar Asaas</label>
          <label><input type="checkbox" checked={allowPix} onChange={(e) => setAllowPix(e.target.checked)} /> Pix</label>
          <label title="Integração ainda não habilitada">
            <input type="checkbox" checked={allowBoleto} onChange={(e) => setAllowBoleto(e.target.checked)} disabled /> Boleto <span className="field-optional">(em preparação)</span>
          </label>
          <label title="Integração ainda não habilitada">
            <input type="checkbox" checked={allowCreditCard} onChange={(e) => setAllowCreditCard(e.target.checked)} disabled /> Cartão <span className="field-optional">(em preparação)</span>
          </label>
          <label><input type="checkbox" checked={allowCash} onChange={(e) => setAllowCash(e.target.checked)} /> Dinheiro / manual</label>
        </div>
      </section>

      <section className="form-section">
        <h2>Segredos e Webhook</h2>
        <p className="helper-text">
          As chaves nunca ficam no banco ou no navegador; são lidas somente do ambiente seguro do servidor.
        </p>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div><span className="field-label">Chave Sandbox</span><span className="status-badge">{values.sandboxKeyConfigured ? "Configurada" : "Não configurada"}</span></div>
          <div><span className="field-label">Chave Produção</span><span className="status-badge">{values.productionKeyConfigured ? "Configurada" : "Não configurada"}</span></div>
          <div><span className="field-label">Token do Webhook</span><span className="status-badge">{values.webhookTokenConfigured ? "Configurado" : "Não configurado"}</span></div>
        </div>
        <p className="helper-text" style={{ marginTop: 12 }}>
          Endpoint: <code>https://controle.altnix.com.br/api/integrations/asaas/webhook</code>
        </p>
        <p className="helper-text">
          Nesta etapa, a integração automática está habilitada somente para Pix. Boleto e cartão permanecem visíveis apenas como preparação futura.
        </p>
        {enabled && !selectedKeyConfigured ? <p className="form-error">O ambiente selecionado ainda não possui chave configurada.</p> : null}
      </section>

      <section className="form-section">
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={save} disabled={pending}>
            {pending ? "Salvando..." : "Salvar configuração"}
          </button>
        </div>
        {message ? <p className="form-success">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </section>
    </>
  );
}
