"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { askAssistantAction, getAssistantUsageAction } from "../../app/sistema/assistente-ir/actions";
import type { AiUsageSummary } from "../../app/sistema/assistente-ir/actions";
import type { AssistantTurn } from "../../app/sistema/assistente-ir/actions";

const QUESTIONS = [
  "Faça um resumo do que está pendente hoje.",
  "Como estão as cobranças em atraso?",
  "Tem solicitações do site sem atendimento?",
  "Quais são os compromissos previstos nos próximos sete dias?",
] as const;

type Message = AssistantTurn & { sources?: string[]; model?: string; usage?: string };

export function AiAssistantChatPanel({ enabled, modules }: {
  enabled: boolean; modules: string[];
}): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const canUse = enabled && modules.length > 0;

  function loadUsage(): void {
    if (busy) return;
    setUsageError(null);
    startTransition(async () => {
      const result = await getAssistantUsageAction();
      if ("error" in result) setUsageError(result.error);
      else setUsage(result.data);
    });
  }

  function ask(raw: string): void {
    const text = raw.trim();
    if (!canUse || busy || text.length < 2 || text.length > 1600) return;
    setError(null);
    setInput("");
    const context: AssistantTurn[] = messages.slice(-8)
      .map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
    const yourMessage: Message = { role: "user", content: text };
    setMessages((old) => [...old, yourMessage]);
    startTransition(async () => {
      try {
        const result = await askAssistantAction(text, context);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        const metadata = result.usage.inputTokens !== null || result.usage.outputTokens !== null
          ? `Tokens: entrada ${result.usage.inputTokens ?? "—"} · saída ${result.usage.outputTokens ?? "—"}`
          : "";
        setMessages((old) => [...old, {
          role: "assistant", content: result.answer,
          sources: result.sources, model: `${result.provider} / ${result.model}`,
          usage: metadata,
        }]);
        setUsage(null);
      } catch {
        setError("Não foi possível consultar a IA. Tente novamente sem reenviar a pergunta anterior.");
      }
    });
  }

  return (
    <section className="form-section form-section--first" aria-label="Conversa com Assistente IR">
      {!enabled ? (
        <p className="form-error" role="alert">
          O Assistente IR está desligado. <Link href="/sistema/configuracoes/assistente-ir">Configure a chave e ligue o serviço</Link>.
        </p>
      ) : null}
      {enabled && !modules.length ? (
        <p className="form-error" role="alert">
          Nenhum módulo foi habilitado. <Link href="/sistema/configuracoes/assistente-ir">Ative os módulos nas configurações</Link>.
        </p>
      ) : null}
      <div className="helper-text">
        <strong>Modo de conversa e consulta (somente leitura).</strong> O assistente pode analisar
        métricas disponíveis e preparar sugestões; não envia mensagens, executa cobranças,
        publica notícias ou emite notas. Não inclua dados pessoais desnecessários nas perguntas.
      </div>
      <p className="helper-text" style={{ marginTop: 8 }}>
        Módulos habilitados: {modules.length ? modules.join(", ") : "nenhum"}.
      </p>
      <div role="log" aria-live="polite" aria-label="Mensagens da conversa"
        style={{ minHeight: 200, display: "grid", gap: 12, marginTop: 18, marginBottom: 18 }}>
        {messages.length === 0 ? (
          <div className="quick-access-card">
            <strong>O que deseja consultar ou preparar?</strong>
            <p className="helper-text">As respostas só usarão os dados dos módulos habilitados. Não há histórico salvo no servidor nesta etapa.</p>
          </div>
        ) : messages.map((item, index) => (
          <div key={index} className="quick-access-card"
            style={{ maxWidth: "min(100%, 940px)", marginLeft: item.role === "user" ? "auto" : 0 }}>
            <strong>{item.role === "user" ? "Você" : "Assistente IR"}</strong>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 8, marginBottom: 0 }}>
              {item.content}
            </p>
            {item.role === "assistant" ? (
              <p className="helper-text" style={{ marginTop: 8 }}>
                {item.model}{item.sources?.length ? ` · Dados: ${item.sources.join(", ")}` : " · Sem dados operacionais consultados"}
                {item.usage ? ` · ${item.usage}` : ""}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {busy ? <p role="status" className="helper-text">Consultando a IA, aguarde...</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); ask(input); }}>
        <label className="form-field">
          <span className="field-label">Sua pergunta ou instrução</span>
          <textarea rows={3} maxLength={1600}
            placeholder="Pergunte sobre a operação do jornal, peça um resumo ou prepare um texto..."
            disabled={!canUse || busy}
            value={input} onChange={(event) => setInput(event.target.value)}
            style={{ width: "100%" }} />
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" className="btn btn-secondary" disabled={busy || !messages.length}
            onClick={() => { setMessages([]); setInput(""); setError(null); }}>
            Nova conversa
          </button>
          <button type="submit" className="btn btn-primary"
            disabled={!canUse || busy || input.trim().length < 2}>
            {busy ? "Aguarde..." : "Enviar pergunta"}
          </button>
        </div>
      </form>
      <p className="helper-text" style={{ marginTop: 10 }}>
        Cada envio utiliza a API paga do provedor escolhido. A página não grava suas mensagens;
        fechar ou recarregar a página encerra esta conversa.
      </p>
      <div className="quick-access-card" style={{ marginTop: 18 }}>
        <strong>Consumo da IA — últimos sete dias</strong>
        <p className="helper-text">
          Contagem registrada pelo sistema, não representa cobrança real. Não inclui usos em outros aplicativos.
        </p>
        <button type="button" className="btn btn-secondary" onClick={loadUsage}
          disabled={busy}>Consultar uso</button>
        {usageError ? <p className="form-error" role="alert">{usageError}</p> : null}
        {usage ? (
          <div style={{ marginTop: 10 }}>
            <p>{usage.requests} solicitação(ões) · {usage.inputTokens} tokens de entrada · {usage.outputTokens} de saída</p>
            {usage.providers.map((entry) => (
              <p className="helper-text" key={entry.provider + entry.model}>
                {entry.provider} / {entry.model}: {entry.requests} pedido(s), {entry.tokens} tokens
              </p>
            ))}
            <p className="helper-text">Máximo das 500 solicitações mais recentes nos últimos sete dias.</p>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {QUESTIONS.map((question) => (
          <button type="button" className="btn btn-secondary" key={question}
            disabled={!canUse || busy} onClick={() => setInput(question)}>{question}</button>
        ))}
      </div>
    </section>
  );
}
