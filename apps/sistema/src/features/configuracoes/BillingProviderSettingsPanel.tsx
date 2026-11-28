"use client";

import { useState, useTransition } from "react";
import {
  provisionAsaasWebhookAction,
  inspectAsaasExistingChargesAction,
  testAsaasConnectionAction,
  testAltnixServiceBridgeAction,
  updateBillingProviderSettingsAction,
} from "../../app/sistema/configuracoes/cobrancas/actions";
import type { ChargeRead } from "../../lib/financeiro/asaasExistingChargesRead";
import { notify } from "../../lib/feedback/notify";

export interface BillingProviderSettingsValues {
  environment: "sandbox" | "production";
  environmentLocked: boolean;
  enabled: boolean;
  allowPix: boolean;
  allowBoleto: boolean;
  allowCreditCard: boolean;
  creditCardMaxInstallments: number;
  creditCardMinInstallmentAmount: number;
  allowCash: boolean;
  defaultDueDays: number;
  financeWhatsapp: string;
  sandboxKeyConfigured: boolean;
  productionKeyConfigured: boolean;
  webhookTokenConfigured: boolean;
  webhookEndpoint: string;
}

export function BillingProviderSettingsPanel({ values }: { values: BillingProviderSettingsValues }): JSX.Element {
  const [environment, setEnvironment] = useState(values.environment);
  const [enabled, setEnabled] = useState(values.enabled);
  const [allowPix, setAllowPix] = useState(values.allowPix);
  const [allowBoleto, setAllowBoleto] = useState(values.allowBoleto);
  const [allowCreditCard, setAllowCreditCard] = useState(values.allowCreditCard);
  const [creditCardMaxInstallments, setCreditCardMaxInstallments] = useState(String(values.creditCardMaxInstallments));
  const [creditCardMinInstallmentAmount, setCreditCardMinInstallmentAmount] = useState(String(values.creditCardMinInstallmentAmount));
  const [allowCash, setAllowCash] = useState(values.allowCash);
  const [defaultDueDays, setDefaultDueDays] = useState(String(values.defaultDueDays));
  const [financeWhatsapp, setFinanceWhatsapp] = useState(values.financeWhatsapp);
  const [pending, startTransition] = useTransition();
  const [inspection,setInspection]=useState<{rows:ChargeRead[];more:boolean}|null>(null);

  const selectedKeyConfigured = environment === "sandbox" ? values.sandboxKeyConfigured : values.productionKeyConfigured;

  function testConnection(): void {
    startTransition(async () => {
      const result = await testAsaasConnectionAction(environment);
      if ("error" in result) {
        notify.error("Conexão com o Asaas falhou", result.error);
        return;
      }
      notify.success("Conexão confirmada", `Conexão com o Asaas confirmada. Status geral da conta: ${result.generalStatus}.`);
    });
  }

  function testServiceBridge():void{
    startTransition(async()=>{
      const result=await testAltnixServiceBridgeAction();
      if("error" in result){notify.error("Comunicação com o Informativo",result.error);return;}
      notify.success("Comunicação confirmada",result.senderWriteEnabled&&result.receiverWriteEnabled?"Escrita habilitada nos dois sistemas.":"Canal autenticado; escrita ainda não liberada nos dois sistemas.");
    });
  }

  function inspectCharges():void{
    setInspection(null);
    startTransition(async()=>{
      const result=await inspectAsaasExistingChargesAction();
      if("error" in result){notify.error("Consulta indisponível",result.error);return;}
      setInspection({rows:result.rows,more:result.more});
    });
  }

  function provisionWebhook(): void {
    startTransition(async () => {
      const result = await provisionAsaasWebhookAction(environment);
      if ("error" in result) {
        notify.error("Não foi possível configurar o webhook", result.error);
        return;
      }
      notify.success(result.created ? "Webhook criado" : "Webhook atualizado",
        result.created
          ? `Webhook do Asaas criado com sucesso (${result.webhookId}).`
          : `Webhook do Asaas atualizado com sucesso (${result.webhookId}).`);
    });
  }

  function save(): void {
    startTransition(async () => {
      const result = await updateBillingProviderSettingsAction({
        environment,
        enabled,
        allowPix,
        allowBoleto,
        allowCreditCard,
        creditCardMaxInstallments,
        creditCardMinInstallmentAmount,
        allowCash,
        defaultDueDays,
        financeWhatsapp,
      });
      if ("error" in result) {
        notify.error("Não foi possível salvar", result.error);
        return;
      }
      notify.success("Configuração atualizada", "A configuração de cobranças foi salva.");
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
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "sandbox" | "production")}
              disabled={values.environmentLocked}
            >
              <option value="sandbox">Sandbox / testes</option>
              <option value="production">Produção</option>
            </select>
            {values.environmentLocked ? (
              <span className="helper-text">Ambiente fixado pela configuração segura do servidor.</span>
            ) : null}
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
          <label title="Cartão de crédito pela página segura do Asaas. Só abre também com a chave de ativação do ambiente.">
            <input type="checkbox" checked={allowCreditCard} onChange={(e) => setAllowCreditCard(e.target.checked)} /> Cartão de crédito
          </label>
          {allowCreditCard ? (
            <>
              <label>Parcelas máximas (1 = só à vista)
                <input type="number" min={1} max={12} value={creditCardMaxInstallments} onChange={(e) => setCreditCardMaxInstallments(e.target.value)} />
              </label>
              <label>Parcela mínima (R$)
                <input type="number" min={5} step="0.01" value={creditCardMinInstallmentAmount} onChange={(e) => setCreditCardMinInstallmentAmount(e.target.value)} />
              </label>
              <p className="helper-text">O cliente paga o valor total do título em qualquer opção; nenhum juro ou taxa é acrescentado ao cliente por este sistema.</p>
            </>
          ) : null}
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
          Endpoint deste ambiente: <code>{values.webhookEndpoint}</code>
        </p>
        <p className="helper-text">
          Nesta etapa, a integração automática está habilitada somente para Pix. Boleto e cartão permanecem visíveis apenas como preparação futura.
        </p>
        <div className="form-actions" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" onClick={testConnection} disabled={pending || !selectedKeyConfigured}>
            Testar conexão com o Asaas
          </button>
          <button type="button" onClick={inspectCharges} disabled={pending || environment!=="production" || !selectedKeyConfigured}>Conferir cobranças existentes</button>
          <button
            type="button"
            onClick={provisionWebhook}
            disabled={pending || !selectedKeyConfigured || !values.webhookTokenConfigured}
          >
            Cadastrar / atualizar webhook
          </button>
        </div>
        {inspection&&<div style={{marginTop:12}}>
          <p className="helper-text">Consulta somente leitura das cobranças Asaas cadastradas no Jornal. Não gera, cancela, estorna ou dá baixa. Correspondência não autoriza exclusão.</p>
          {inspection.more&&<p role="status">Apenas as 10 cobranças mais recentes; consulta parcial.</p>}
          {inspection.rows.length===0?<p>Nenhuma cobrança Asaas cadastrada no Jornal.</p>:<div style={{overflowX:"auto"}}><table><thead><tr><th>Local</th><th>Asaas</th><th>Valor local / externo</th><th>Conferência</th></tr></thead><tbody>{inspection.rows.map(row=><tr key={row.id}><td>{row.localStatus}</td><td>{row.providerStatus??"Não verificado"}</td><td>{row.localAmount.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} / {row.providerAmount===null?"—":row.providerAmount.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td>{row.reason}</td></tr>)}</tbody></table></div>}
        </div>}
        {enabled && !selectedKeyConfigured ? <p className="form-error">O ambiente selecionado ainda não possui chave configurada.</p> : null}
        {enabled && !values.webhookTokenConfigured ? <p className="form-error">O token de autenticação do webhook ainda não está configurado.</p> : null}
      </section>

      <section className="form-section">
        <h2>Integração Altnix Informativo</h2>
        <p className="helper-text">Verifica a comunicação autenticada entre os sistemas, sem criar vínculo, cobrança ou autorização.</p>
        <div className="form-actions">
          <button type="button" onClick={testServiceBridge} disabled={pending}>Testar comunicação com o Informativo</button>
        </div>
      </section>

      <section className="form-section">
        <div className="form-actions">
          <button type="button" className="form-action-primary" onClick={save} disabled={pending}>
            {pending ? "Salvando..." : "Salvar configuração"}
          </button>
        </div>
      </section>
    </>
  );
}
