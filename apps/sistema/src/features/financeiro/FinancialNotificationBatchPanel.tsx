"use client";

import { useState, useTransition, type JSX } from "react";
import {
  continueFinancialNotificationBatchAction, findFinancialNotificationCandidatesAction,
  getFinancialNotificationBatchAction, retryFinancialNotificationAction, sendFinancialNotificationBatchAction,
  type BatchCandidateRow, type BatchResultRow,
} from "../../app/sistema/financeiro/avisos/actions";
import { notify } from "../../lib/feedback/notify";
import { confirmDialog } from "../../lib/feedback/confirmStore";
import { BATCH_KIND_LABEL, type BatchKind } from "../../lib/notifications/financialBatchLabels";

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

type TemplateInfo = { kind: string; configured: boolean; proposedName: string };

export function FinancialNotificationBatchPanel({ providerReady, templates }: { providerReady: boolean; templates: TemplateInfo[] }): JSX.Element {
  const [kind, setKind] = useState<BatchKind>("billing");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<BatchCandidateRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResultRow[]>([]);
  const [pending, startTransition] = useTransition();

  const template = templates.find((t) => t.kind === kind);
  const ready = providerReady && template?.configured === true;
  const eligible = rows.filter((r) => r.eligible);

  function search_() {
    setError(null); setBatchId(null); setResults([]);
    startTransition(async () => {
      const result = await findFinancialNotificationCandidatesAction({ kind, from, to, search });
      if ("error" in result) { setError(result.error); setRows([]); return; }
      setRows(result.data); setSelected(new Set());
    });
  }

  function toggle(key: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  async function loadResults(id: string) {
    const result = await getFinancialNotificationBatchAction(id);
    if ("error" in result) { setError(result.error); return; }
    setResults(result.data);
  }

  async function send() {
    const chosen = rows.filter((r) => selected.has(r.key) && r.eligible);
    if (!chosen.length) return;
    const names = chosen.slice(0, 12).map((r) => `${r.clientName} ${r.phoneMasked ?? ""}`.trim()).join("; ") + (chosen.length > 12 ? `; e mais ${chosen.length - 12}` : "");
    const confirmed = await confirmDialog({
      title: `Enviar ${chosen.length} mensagem(ns) por WhatsApp?`,
      description: `${BATCH_KIND_LABEL[kind]}. Cada cliente recebe uma mensagem individual (não há grupo). Destinatários: ${names}. Nenhuma cobrança será criada.`,
      confirmLabel: "Enviar", destructive: false,
    });
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const first = await sendFinancialNotificationBatchAction({ kind, keys: chosen.map((r) => r.key) });
      if ("error" in first) { notify.error("Envio não iniciado", first.error); return; }
      setBatchId(first.data.batchId);
      let remaining = first.data.remaining;
      // Blocos sequenciais (sem polling): cada chamada processa até 25 e a interface continua até zerar.
      for (let i = 0; i < 20 && remaining > 0; i += 1) {
        const next = await continueFinancialNotificationBatchAction(first.data.batchId);
        if ("error" in next) { notify.error("Envio interrompido", `${next.error} Use "Continuar envio".`); break; }
        remaining = next.data.remaining;
      }
      await loadResults(first.data.batchId);
      const extra = [first.data.duplicated ? `${first.data.duplicated} já enviada(s) hoje` : "", first.data.ineligible ? `${first.data.ineligible} fora dos critérios` : ""].filter(Boolean).join(", ");
      notify.success("Lote processado", `Veja o resultado de cada cliente abaixo. "Aceito pela Meta" não significa entregue.${extra ? ` (${extra})` : ""}`);
    });
  }

  function continueBatch() {
    if (!batchId) return;
    startTransition(async () => {
      const next = await continueFinancialNotificationBatchAction(batchId);
      if ("error" in next) { notify.error("Envio não continuou", next.error); return; }
      await loadResults(batchId);
    });
  }

  async function retry(row: BatchResultRow, confirmUncertain: boolean) {
    if (confirmUncertain) {
      const ok = await confirmDialog({
        title: "Reenviar mesmo com resultado incerto?",
        description: `A Meta não deu resposta conclusiva para ${row.clientName}. A mensagem pode já ter sido entregue; reenviar pode duplicar. Confira no WhatsApp antes.`,
        confirmLabel: "Reenviar mesmo assim", destructive: true,
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await retryFinancialNotificationAction({ id: row.id, confirmUncertain });
      if ("error" in result) { notify.error("Reenvio não concluído", result.error); return; }
      if (batchId) await loadResults(batchId);
    });
  }

  return (
    <div className="article-step-layout">
      <section>
        {!providerReady ? <p className="form-error" role="alert">WhatsApp Cloud API não configurada neste ambiente: o envio está indisponível.</p> : null}
        {providerReady && template && !template.configured ? (
          <p className="form-error" role="alert">
            Template não configurado para este tipo. É necessário um modelo aprovado na Meta (nome sugerido: <strong>{template.proposedName}</strong>); sem ele o envio permanece desligado.
          </p>
        ) : null}

        <div className="filter-bar">
          <label>Tipo de mensagem
            <select value={kind} onChange={(e) => { setKind(e.target.value as BatchKind); setRows([]); setSelected(new Set()); setResults([]); setBatchId(null); }}>
              {(Object.keys(BATCH_KIND_LABEL) as BatchKind[]).map((k) => <option key={k} value={k}>{BATCH_KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label>{kind === "billing" ? "Vencimento de" : kind === "confirmation" ? "Pago de" : "Recibo de"}
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>até<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Cliente ou referência<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" /></label>
          <button type="button" onClick={search_} disabled={pending}>Buscar</button>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}

        {rows.length === 0 ? <p className="helper-text">Nenhum título listado. Ajuste os filtros e busque.</p> : (
          <>
            <table className="materias-table">
              <thead><tr><th /><th>Cliente</th><th>Referência</th><th>Valor</th><th>Vencimento</th><th>WhatsApp</th><th>Situação</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td><input type="checkbox" checked={selected.has(r.key)} disabled={!r.eligible || pending} onChange={() => toggle(r.key)} aria-label={`Selecionar ${r.clientName}`} /></td>
                    <td>{r.clientName}</td><td>{r.reference}</td><td>{money(r.amount)}</td><td>{date(r.dueDate)}</td>
                    <td>{r.phoneMasked ?? <span className="status-pill status-pill--archived">sem WhatsApp válido</span>}</td>
                    <td>{r.eligible ? <span className="status-pill status-pill--published">pode enviar</span> : <span className="helper-text">{r.reason}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="helper-text">{eligible.length} elegível(is) de {rows.length}; {selected.size} selecionado(s).</p>
            <div className="form-actions">
              <button type="button" onClick={() => setSelected(new Set(eligible.map((r) => r.key)))} disabled={pending || !eligible.length}>Selecionar elegíveis</button>
              <button type="button" className="form-action-primary" onClick={send} disabled={pending || !ready || selected.size === 0}>Revisar e enviar</button>
            </div>
          </>
        )}
      </section>

      {results.length > 0 ? (
        <section>
          <h2>Resultado por cliente</h2>
          <table className="materias-table">
            <thead><tr><th>Cliente</th><th>Referência</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>{r.clientName}</td><td>{r.reference ?? "—"}</td>
                  <td>{r.statusLabel}{r.detail ? <><br /><span className="helper-text">{r.detail}</span></> : null}</td>
                  <td>
                    {r.canRetry ? <button type="button" className="text-link" onClick={() => retry(r, false)} disabled={pending}>Reenviar</button> : null}
                    {r.canRetryUncertain ? <button type="button" className="text-link" onClick={() => retry(r, true)} disabled={pending}>Reenviar mesmo assim</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-actions">
            <button type="button" onClick={continueBatch} disabled={pending || !batchId}>Continuar envio</button>
            <button type="button" onClick={() => batchId && startTransition(() => loadResults(batchId))} disabled={pending || !batchId}>Atualizar resultados</button>
          </div>
          <p className="helper-text">"Aceito pela Meta" indica que o provedor recebeu a mensagem. "Entregue" e "Lido" aparecem somente quando o provedor envia o status de entrega.</p>
        </section>
      ) : null}
    </div>
  );
}
