"use client";

import { useMemo, useState, useTransition, type JSX } from "react";
import {
  confirmDueReminderBatchSendAction, deleteDueReminderDraftAction, findDueReminderCandidatesAction,
  getDueReminderBatchDetailAction, listDueReminderBatchesAction, saveDueReminderDraftAction,
  searchClientsForDueReminderAction,
  type DueReminderBatchRow, type DueReminderCandidate,
} from "../../app/sistema/assinaturas/avisos-vencimento/actions";

const DEFAULT_TEMPLATE =
  "Olá, {{cliente}}! Passando para lembrar que sua assinatura ({{assinatura}}) do Jornal IR tem vencimento em {{mes_ano}}. Qualquer dúvida, é só responder esta mensagem.";

function firstOfMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastOfMonth(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

type Recipient = DueReminderCandidate;

function renderPreview(template: string, recipient: Recipient | undefined, mesAnoLabel: string): string {
  if (!recipient) return template;
  return template
    .replaceAll("{{cliente}}", recipient.clientName)
    .replaceAll("{{assinatura}}", recipient.subscriptionLabels.join(" + "))
    .replaceAll("{{mes_ano}}", mesAnoLabel);
}

const MONTH_LABELS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function DueReminderPanel({
  initialHistory, initialError, templateConfigured, sendEnabled,
}: {
  initialHistory: DueReminderBatchRow[];
  initialError: string | null;
  templateConfigured: boolean;
  sendEnabled: boolean;
}): JSX.Element {
  const today = new Date();
  const [rangeStart, setRangeStart] = useState(firstOfMonth(today));
  const [rangeEnd, setRangeEnd] = useState(lastOfMonth(today));
  const [candidates, setCandidates] = useState<Recipient[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Recipient[]>([]);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openBatch, setOpenBatch] = useState<{ id: string; status: string; sentStats?: { sent: number; failed: number; skipped: number } } | null>(null);

  function applyPreset(preset: "current" | "next"): void {
    const base = preset === "current" ? today : addMonths(today, 1);
    setRangeStart(firstOfMonth(base));
    setRangeEnd(lastOfMonth(base));
  }

  function search(): void {
    setError(null); setNotice(null);
    startTransition(async () => {
      const result = await findDueReminderCandidatesAction({ startDate: rangeStart, endDate: rangeEnd });
      if ("error" in result) { setError(result.error); return; }
      setCandidates(result.data);
      setSelectedCandidateIds(new Set());
    });
  }

  function toggleCandidate(id: string): void {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllCandidates(): void {
    setSelectedCandidateIds(new Set(candidates.map((c) => c.clientId)));
  }

  function transferSelected(): void {
    const toAdd = candidates.filter((c) => selectedCandidateIds.has(c.clientId));
    setRecipients((prev) => {
      const existingIds = new Set(prev.map((r) => r.clientId));
      const merged = [...prev];
      for (const c of toAdd) if (!existingIds.has(c.clientId)) merged.push(c);
      return merged;
    });
    setNotice(`${toAdd.length} destinatário(s) transferido(s) para a lista.`);
  }

  function removeRecipient(clientId: string): void {
    setRecipients((prev) => prev.filter((r) => r.clientId !== clientId));
  }

  function runSearch(): void {
    setError(null);
    startTransition(async () => {
      const result = await searchClientsForDueReminderAction(searchQuery);
      if ("error" in result) { setError(result.error); return; }
      setSearchResults(result.data);
    });
  }

  function addFromSearch(c: Recipient): void {
    setRecipients((prev) => (prev.some((r) => r.clientId === c.clientId) ? prev : [...prev, c]));
  }

  const duplicatePhones = useMemo(() => {
    const byPhone = new Map<string, number>();
    for (const r of recipients) {
      if (!r.phone) continue;
      const normalized = r.phone.replace(/\D/g, "");
      byPhone.set(normalized, (byPhone.get(normalized) ?? 0) + 1);
    }
    return new Set([...byPhone.entries()].filter(([, count]) => count > 1).map(([phone]) => phone));
  }, [recipients]);

  const mesAnoLabel = useMemo(() => {
    const d = new Date(rangeStart + "T12:00:00Z");
    return `${MONTH_LABELS[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
  }, [rangeStart]);

  const previewRecipient = recipients.find((r) => r.clientId === previewClientId) ?? recipients[0];

  function saveDraft(): void {
    if (recipients.length === 0) { setError("Adicione ao menos um destinatário antes de salvar."); return; }
    setError(null); setNotice(null);
    startTransition(async () => {
      const result = await saveDueReminderDraftAction({
        id: batchId,
        referenceMonth: firstOfMonth(new Date(rangeStart + "T12:00:00Z")),
        messageTemplate: template,
        recipients: recipients.map((r) => ({ clientId: r.clientId, subscriptionIds: r.subscriptionIds, phone: r.phone })),
      });
      if ("error" in result) { setError(result.error); return; }
      setBatchId(result.data.id);
      setNotice("Rascunho salvo.");
      void refreshHistory();
    });
  }

  function refreshHistory(): void {
    void listDueReminderBatchesAction().then((result) => {
      if ("ok" in result) setHistory(result.data);
    });
  }

  function openHistoryBatch(id: string): void {
    setError(null); setNotice(null);
    startTransition(async () => {
      const result = await getDueReminderBatchDetailAction(id);
      if ("error" in result) { setError(result.error); return; }
      setBatchId(result.data.batch.id);
      setTemplate(result.data.batch.messageTemplate);
      setRangeStart(result.data.batch.referenceMonth);
      setRecipients(result.data.recipients.map((r) => ({
        clientId: r.clientId, clientName: r.clientName ?? "(cliente)", phone: r.phone, phoneValid: r.phoneValid,
        subscriptionIds: r.subscriptionIds, subscriptionLabels: [], dueDates: [], dueDayMismatch: false,
      })));
      setOpenBatch({ id: result.data.batch.id, status: result.data.batch.status });
    });
  }

  function deleteDraft(id: string): void {
    if (!window.confirm("Excluir este lote de avisos? Esta ação não pode ser desfeita.")) return;
    startTransition(async () => {
      const result = await deleteDueReminderDraftAction(id);
      if ("error" in result) { setError(result.error); return; }
      setHistory((prev) => prev.filter((b) => b.id !== id));
      if (batchId === id) { setBatchId(undefined); setRecipients([]); setOpenBatch(null); }
    });
  }

  function confirmSend(): void {
    if (!batchId) return;
    if (!window.confirm(`Confirmar o envio deste lote para ${recipients.length} destinatário(s)?`)) return;
    setError(null); setNotice(null);
    startTransition(async () => {
      const result = await confirmDueReminderBatchSendAction(batchId);
      if ("error" in result) { setError(result.error); return; }
      setNotice(`Envio concluído: ${result.data.sent} enviado(s), ${result.data.failed} falha(s), ${result.data.skipped} ignorado(s) (telefone inválido).`);
      setOpenBatch({ id: batchId, status: "sent", sentStats: result.data });
    });
  }

  const isDraftLocked = openBatch?.status === "sent";

  return (
    <div className="article-step-layout">
      <div className="article-step-main">
        <section className="form-section form-section--first">
          <h2>1. Filtrar assinaturas a vencer</h2>
          <div className="form-actions" style={{ marginBottom: 10 }}>
            <button type="button" onClick={() => applyPreset("current")} disabled={pending}>Mês atual</button>
            <button type="button" onClick={() => applyPreset("next")} disabled={pending}>Próximo mês</button>
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span className="field-label">De</span>
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} disabled={pending} />
            </label>
            <label className="form-field">
              <span className="field-label">Até</span>
              <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} disabled={pending} />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={search} disabled={pending}>Buscar assinaturas</button>
            {candidates.length > 0 ? <button type="button" onClick={selectAllCandidates} disabled={pending}>Selecionar todos ({candidates.length})</button> : null}
            {selectedCandidateIds.size > 0 ? <button type="button" onClick={transferSelected} disabled={pending}>Transferir selecionados ({selectedCandidateIds.size})</button> : null}
          </div>
          {candidates.length > 0 ? (
            <ul className="cadastro-family-tree">
              {candidates.map((c) => (
                <li key={c.clientId}>
                  <label style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedCandidateIds.has(c.clientId)} onChange={() => toggleCandidate(c.clientId)} style={{ marginRight: 8 }} />
                    <strong>{c.clientName}</strong> — {c.subscriptionLabels.join(" + ")} — vence {c.dueDates.map((d) => d.split("-").reverse().join("/")).join(", ")}
                    {!c.phoneValid ? <span className="status-pill status-pill--archived"> sem telefone válido</span> : null}
                    {c.dueDayMismatch ? <span className="status-pill status-pill--draft"> dia-base diverge do cadastro</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="form-section">
          <h2>2. Lista de destinatários (editável)</h2>
          <div className="form-field">
            <span className="field-label">Adicionar outro cliente</span>
            <div className="form-actions" style={{ marginTop: 4 }}>
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar por nome" disabled={pending || isDraftLocked} />
              <button type="button" onClick={runSearch} disabled={pending || isDraftLocked}>Buscar</button>
            </div>
            {searchResults.length > 0 ? (
              <ul className="cadastro-family-tree">
                {searchResults.map((c) => (
                  <li key={c.clientId}>
                    {c.clientName} {!c.phoneValid ? <span className="status-pill status-pill--archived">sem telefone válido</span> : null}{" "}
                    <button type="button" className="text-link" onClick={() => addFromSearch(c)} disabled={isDraftLocked}>Adicionar</button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {recipients.length === 0 ? <p className="helper-text">Nenhum destinatário na lista ainda.</p> : (
            <ul className="cadastro-family-tree">
              {recipients.map((r) => {
                const normalizedPhone = r.phone?.replace(/\D/g, "") ?? "";
                const isDuplicate = normalizedPhone && duplicatePhones.has(normalizedPhone);
                return (
                  <li key={r.clientId}>
                    <strong>{r.clientName}</strong> — {r.phone || "sem telefone"}
                    {!r.phoneValid ? <span className="status-pill status-pill--archived"> inválido</span> : null}
                    {isDuplicate ? <span className="status-pill status-pill--draft"> telefone duplicado</span> : null}
                    {" "}
                    <button type="button" className="text-link" onClick={() => setPreviewClientId(r.clientId)} disabled={isDraftLocked}>Prévia</button>{" "}
                    {!isDraftLocked ? <button type="button" className="text-link" onClick={() => removeRecipient(r.clientId)}>Remover</button> : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="helper-text">{recipients.length} destinatário(s) na lista final.</p>
        </section>

        <section className="form-section">
          <h2>3. Mensagem</h2>
          <p className="helper-text">
            Variáveis disponíveis: <code>{"{{cliente}}"}</code> <code>{"{{assinatura}}"}</code> <code>{"{{mes_ano}}"}</code> — nunca inclua o dia exato (o
            dia-base pode mudar por feriado/fim de semana).
          </p>
          <label className="form-field">
            <span className="field-label">Modelo da mensagem</span>
            <textarea value={template} maxLength={1000} rows={4} onChange={(e) => setTemplate(e.target.value)} disabled={isDraftLocked} />
          </label>
          {previewRecipient ? (
            <div className="aniv-homenagem-message">
              <p className="field-label">Prévia — {previewRecipient.clientName}</p>
              <div style={{ maxWidth: 360, border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", background: "#e9fbe3" }}>
                <p style={{ margin: 0, fontSize: 13 }}>{renderPreview(template, previewRecipient, mesAnoLabel)}</p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="form-section">
          <h2>4. Confirmação</h2>
          {!templateConfigured ? (
            <p className="form-error" role="alert">
              Nenhum template de vencimento configurado/aprovado na Meta (variável de ambiente
              <code> WHATSAPP_DUE_REMINDER_TEMPLATE</code>) — nunca reaproveita o template de confirmação de pagamento.
            </p>
          ) : null}
          {!sendEnabled ? (
            <p className="form-error" role="alert">
              Envio real ainda está desligado (aguardando autorização explícita e testes). Salvar/revisar o lote
              funciona normalmente.
            </p>
          ) : null}
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={saveDraft} disabled={pending || isDraftLocked}>
              {pending ? "Salvando…" : "Salvar rascunho"}
            </button>
            <button type="button" onClick={confirmSend} disabled={pending || !batchId || isDraftLocked}>
              Confirmar envio
            </button>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {notice ? <p className="helper-text" role="status">{notice}</p> : null}
        </section>

        <section className="form-section">
          <h2>Melhorias futuras (não implementadas ainda)</h2>
          <p className="helper-text">
            Link individual de pagamento no WhatsApp; acesso do assinante por CPF com verificação segura de
            identidade; consulta da cobrança e QR Code PIX/copia-e-cola via integração Asaas — nunca expor dados
            financeiros só com CPF.
          </p>
        </section>
      </div>

      <aside className="article-step-aside">
        <section className="form-section form-section--compact">
          <h2>Histórico de lotes</h2>
          {history.length === 0 ? <p className="helper-text">Nenhum lote preparado ainda.</p> : null}
          <ul className="cadastro-family-tree">
            {history.map((b) => (
              <li key={b.id}>
                {b.referenceMonth.split("-").slice(0, 2).reverse().join("/")} — {b.recipientCount} destinatário(s) —{" "}
                <span className={`status-pill status-pill--${b.status === "sent" ? "published" : "draft"}`}>{b.status === "sent" ? "Enviado" : "Rascunho"}</span>
                {" "}
                <button type="button" className="text-link" onClick={() => openHistoryBatch(b.id)}>Abrir</button>
                {b.status === "draft" ? <> <button type="button" className="text-link" onClick={() => deleteDraft(b.id)}>Excluir</button></> : null}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
