"use client";

import { useState, useTransition } from "react";
import {
  saveAssistantProviderKeyAction, updateAssistantSettingsAction,
  testAssistantConnectionAction, getAssistantOperationalBriefAction,
} from "../../app/sistema/configuracoes/assistente-ir/actions";
import {
  AI_DEFAULT_MODELS, AI_MODULES,
} from "./aiSettingsTypes";
import type { AiModuleKey, AiModuleMode, AiProvider, AiSettingsInput, AiSettingsSnapshot, AiOperationalBrief } from "./aiSettingsTypes";

const MODES: ReadonlyArray<{ value: AiModuleMode; label: string }> = [
  { value: "off", label: "Desligado" },
  { value: "assistido", label: "Assistido" },
  { value: "autonomo", label: "Autônomo" },
];

export function AiAssistantSettingsPanel({ initial }: { initial: AiSettingsSnapshot }): JSX.Element {
  const [form, setForm] = useState<AiSettingsInput>({
    enabled: initial.enabled, provider: initial.provider, model: initial.model,
    modes: { ...initial.modes },
  });
  const [keys, setKeys] = useState({ ...initial.configuredKeys });
  const [newKey, setNewKey] = useState("");
  const [brief, setBrief] = useState<AiOperationalBrief | null>(null);
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearFeedback(): void { setMessage(null); setError(null); }

  function selectProvider(value: AiProvider): void {
    setForm((old) => ({
      ...old, provider: value,
      model: value === old.provider ? old.model : AI_DEFAULT_MODELS[value],
    }));
    setNewKey("");
    setBrief(null);
    clearFeedback();
  }

  function changeMode(key: AiModuleKey, value: AiModuleMode): void {
    setForm((old) => ({ ...old, modes: { ...old.modes, [key]: value } }));
    setBrief(null);
    clearFeedback();
  }

  function saveSettings(): void {
    clearFeedback();
    startTransition(async () => {
      const result = await updateAssistantSettingsAction(form);
      if ("error" in result) { setError(result.error); return; }
      setMessage("Configurações salvas. O servidor verificará esses controles antes de qualquer chamada à IA.");
    });
  }

  function saveKey(): void {
    clearFeedback();
    const provider = form.provider;
    startTransition(async () => {
      const result = await saveAssistantProviderKeyAction(provider, newKey);
      if ("error" in result) { setError(result.error); return; }
      setKeys((old) => ({ ...old, [provider]: true }));
      setNewKey("");
      setMessage("Chave salva de forma criptografada no servidor. O valor não será exibido novamente.");
    });
  }

  function testConnection(): void {
    clearFeedback();
    startTransition(async () => {
      const result = await testAssistantConnectionAction(form.provider);
      if ("error" in result) { setError(result.error); return; }
      setMessage(result.message);
    });
  }

  function requestBrief(): void {
    clearFeedback();
    setBrief(null);
    startTransition(async () => {
      const result = await getAssistantOperationalBriefAction();
      if ("error" in result) { setError(result.error); return; }
      setBrief(result.data);
      setMessage("Resumo atualizado a partir dos dados do sistema. Nenhuma chamada de IA foi realizada.");
    });
  }

  function money(value: number): string {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  const unavailable = !initial.backendAvailable;
  return (
    <>
      {!initial.backendAvailable ? (
        <p className="form-error" role="alert">
          Configuração ainda indisponível. É necessário aplicar a migration do Assistente IR e configurar o Supabase no servidor.
          Nenhum módulo de IA será executado até lá.
        </p>
      ) : null}
      <section className="form-section form-section--first">
        <h2>Funcionamento geral</h2>
        <p className="helper-text">
          O proprietário controla a atuação da IA. O modo autônomo não autoriza cancelamentos,
          pagamentos, publicação de notícias ou operações fiscais sem aprovação humana.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <input
            type="checkbox" checked={form.enabled} disabled={unavailable || busy}
            onChange={(event) => { setForm((old) => ({ ...old, enabled: event.target.checked })); setBrief(null); clearFeedback(); }}
          />
          <strong>{form.enabled ? "Assistente ativado" : "Assistente desativado"}</strong>
        </label>
        <p className="helper-text">Desligar bloqueia novas chamadas no servidor. Não substitui a confirmação para cada ação sensível.</p>
      </section>

      <section className="form-section">
        <h2>Provedor e modelo</h2>
        <div className="form-grid">
          <label className="form-field">
            <span className="field-label">Provedor</span>
            <select value={form.provider} disabled={unavailable || busy}
              onChange={(event) => selectProvider(event.target.value as AiProvider)}>
              <option value="openai">OpenAI / GPT</option>
              <option value="anthropic">Anthropic / Claude</option>
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">Modelo do provedor</span>
            <input value={form.model} disabled={unavailable || busy} maxLength={100}
              onChange={(event) => { setForm((old) => ({ ...old, model: event.target.value })); clearFeedback(); }}
              placeholder={AI_DEFAULT_MODELS[form.provider]} autoComplete="off" />
            <span className="helper-text">Informe um modelo disponível na sua conta. Alterar o modelo não altera a assinatura do chat.</span>
          </label>
        </div>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div>
            <span className="field-label">Chave OpenAI</span>
            <div className="helper-text">{keys.openai ? "Armazenada no cofre" : "Não configurada"}</div>
          </div>
          <div>
            <span className="field-label">Chave Anthropic</span>
            <div className="helper-text">{keys.anthropic ? "Armazenada no cofre" : "Não configurada"}</div>
          </div>
        </div>
        <label className="form-field" style={{ marginTop: 14, maxWidth: 600 }}>
          <span className="field-label">Cadastrar ou substituir chave de {form.provider === "openai" ? "OpenAI" : "Anthropic"}</span>
          <input
            type="password" autoComplete="new-password" spellCheck={false}
            disabled={unavailable || busy || !initial.encryptionAvailable}
            value={newKey} onChange={(event) => setNewKey(event.target.value)}
            placeholder="Cole aqui uma chave nova; a existente nunca é revelada"
          />
          <span className="helper-text">
            A chave é enviada somente ao servidor autenticado e gravada com criptografia AES-256-GCM.
            Não entra em logs, histórico do navegador ou respostas da IA.
          </span>
        </label>
        {!initial.encryptionAvailable ? (
          <p className="helper-text">Cofre indisponível: configure AI_CONFIG_ENCRYPTION_KEY no ambiente seguro antes de cadastrar chaves.</p>
        ) : null}
        <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }}
          disabled={unavailable || busy || !initial.encryptionAvailable || !newKey.trim()}
          onClick={saveKey}>Salvar chave do provedor selecionado</button>
        <button type="button" className="btn btn-secondary" style={{ margin: "12px 0 0 10px" }}
          disabled={unavailable || busy || !keys[form.provider]}
          onClick={testConnection}>Testar conexão com {form.provider === "openai" ? "OpenAI" : "Claude"}</button>
        <p className="helper-text">
          Teste manual de autenticação, sem gerar mensagem; não ativa o assistente nem confirma que o modelo escolhido está liberado.
        </p>
      </section>

      <section className="form-section">
        <h2>Autonomia por módulo</h2>
        <p className="helper-text">
          Desligado: não usa IA. Assistido: consulta e recomenda mediante solicitação.
          Autônomo: permite futuramente tarefas de observação e preparação sem intervenção,
          respeitando permissões. A execução agendada dos módulos ainda não foi implementada.
        </p>
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {AI_MODULES.map((item) => (
            <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{item.label}</strong>
                <div className="helper-text">{item.description}</div>
              </div>
              <label className="form-field" style={{ minWidth: 160 }}>
                <span className="field-label">Modo</span>
                <select aria-label={"Modo da IA para " + item.label}
                  value={form.modes[item.key]} disabled={unavailable || busy}
                  onChange={(event) => changeMode(item.key, event.target.value as AiModuleMode)}>
                  {MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                </select>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="form-section">
        <h2>Resumo operacional</h2>
        <p className="helper-text">
          Consulta manual e somente leitura dos módulos ligados. Os números vêm do sistema,
          sem análise de IA, envio de alertas ou alterações em clientes e cobranças.
        </p>
        <button type="button" className="btn btn-secondary"
          disabled={unavailable || busy || !form.enabled}
          onClick={requestBrief}>Atualizar resumo</button>
        {brief ? (
          <div style={{ marginTop: 14 }}>
            <p className="helper-text">
              Consultado em {new Date(brief.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
            </p>
            <ul className="quick-access-grid">
              {brief.financeiro ? <li><div className="quick-access-card">
                <span className="quick-access-label">Financeiro</span>
                <span className="quick-access-description">
                  {brief.financeiro.overdueCount} título(s) vencido(s): {money(brief.financeiro.overdueAmount)}.
                </span>
                <span className="helper-text">
                  Hoje: {brief.financeiro.receivedTodayCount} recebimento(s), {money(brief.financeiro.receivedTodayAmount)}.
                </span>
              </div></li> : null}
              {brief.site ? <li><div className="quick-access-card">
                <span className="quick-access-label">Pedidos do site</span>
                <span className="quick-access-description">
                  {brief.site.unattendedRequests} solicitação(ões) sem atendimento.
                </span>
              </div></li> : null}
              {brief.agenda ? <li><div className="quick-access-card">
                <span className="quick-access-label">Agenda</span>
                <span className="quick-access-description">
                  {brief.agenda.scheduledToday} compromisso(s) hoje,
                  {" "}{brief.agenda.scheduledNextSevenDays} nos próximos sete dias (incluindo hoje).
                </span>
              </div></li> : null}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="form-section">
        <h2>Solicitações aguardando autorização</h2>
        <p className="helper-text">
          {initial.pendingApprovals === 0
            ? "Nenhuma proposta pendente. A central de aprovações está preparada, mas nenhum fluxo financeiro ou editorial foi conectado."
            : String(initial.pendingApprovals) + " proposta(s) registrada(s) aguardando integração do fluxo de autorização."}
        </p>
        <p className="helper-text">
          Nenhuma proposta executa ações sozinha. A aprovação com confirmação de identidade será desenvolvida antes de habilitar qualquer operação sensível.
        </p>
      </section>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p role="status" className="helper-text">{message}</p> : null}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 0" }}>
        <button type="button" className="btn btn-primary"
          disabled={unavailable || busy} onClick={saveSettings}>
          {busy ? "Aguarde..." : "Salvar configurações do Assistente IR"}
        </button>
      </div>
      <p className="helper-text">
        Sem limite de gastos obrigatório nesta etapa. O consumo da API é separado das mensalidades de ChatGPT e Claude.
      </p>
    </>
  );
}
