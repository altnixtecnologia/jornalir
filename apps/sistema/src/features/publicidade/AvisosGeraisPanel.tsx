"use client";

import { useState, useTransition, type JSX } from "react";
import {
  confirmAnnouncementSendAction, deleteAnnouncementDraftAction, saveAnnouncementDraftAction,
  type CommercialAnnouncementRow,
} from "../../app/sistema/publicidade/avisos/actions";

const STATUS_LABELS: Record<CommercialAnnouncementRow["status"], string> = {
  draft: "Rascunho",
  sent: "Enviado",
};

function blankDraft(): { id?: string; title: string; body: string; href: string } {
  return { title: "", body: "", href: "" };
}

/** Mensagens institucionais/comerciais (push) para leitores do site/app —
 * separadas das notícias normais/urgentes (categoria de consentimento
 * própria, "Avisos gerais"). Fluxo: rascunho -> revisão/prévia -> confirmar
 * envio. O envio real fica desligado (COMMERCIAL_PUSH_SEND_ENABLED) até o
 * aplicativo ser testado e a ativação ser autorizada — salvar/editar
 * rascunhos funciona normalmente mesmo assim, nunca alcança leitores. */
export function AvisosGeraisPanel({
  initialHistory, initialError, sendEnabled,
}: {
  initialHistory: CommercialAnnouncementRow[];
  initialError: string | null;
  sendEnabled: boolean;
}): JSX.Element {
  const [history, setHistory] = useState(initialHistory);
  const [draft, setDraft] = useState(blankDraft());
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEdit(row: CommercialAnnouncementRow): void {
    if (row.status !== "draft") return;
    setDraft({ id: row.id, title: row.title, body: row.body, href: row.href ?? "" });
    setReviewing(false);
    setError(null);
    setNotice(null);
  }

  function saveDraft(): void {
    setError(null); setNotice(null);
    startTransition(async () => {
      const result = await saveAnnouncementDraftAction(draft);
      if ("error" in result) { setError(result.error); return; }
      setNotice("Rascunho salvo.");
      setDraft((d) => ({ ...d, id: result.data.id }));
      setHistory((prev) => {
        const idx = prev.findIndex((r) => r.id === result.data.id);
        const row: CommercialAnnouncementRow = {
          id: result.data.id, title: draft.title.trim(), body: draft.body.trim(),
          href: draft.href.trim() || null, status: "draft", createdAt: prev[idx]?.createdAt ?? new Date().toISOString(),
          sentAt: null,
        };
        if (idx === -1) return [row, ...prev];
        const next = [...prev];
        next[idx] = row;
        return next;
      });
    });
  }

  function deleteDraft(id: string): void {
    if (!window.confirm("Excluir este rascunho? Esta ação não pode ser desfeita.")) return;
    setError(null); setNotice(null);
    startTransition(async () => {
      const result = await deleteAnnouncementDraftAction(id);
      if ("error" in result) { setError(result.error); return; }
      setHistory((prev) => prev.filter((r) => r.id !== id));
      if (draft.id === id) setDraft(blankDraft());
      setNotice("Rascunho excluído.");
    });
  }

  function confirmSend(): void {
    if (!draft.id) return;
    if (!window.confirm(`Confirmar o envio deste aviso para todos os leitores inscritos em "Avisos gerais"?`)) return;
    setError(null); setNotice(null);
    const requestId = crypto.randomUUID();
    startTransition(async () => {
      const result = await confirmAnnouncementSendAction({ id: draft.id!, requestId });
      if ("error" in result) { setError(result.error); return; }
      setNotice("Envio confirmado e incluído na fila de entrega.");
      setHistory((prev) => prev.map((r) => (r.id === draft.id ? { ...r, status: "sent", sentAt: new Date().toISOString() } : r)));
      setDraft(blankDraft());
      setReviewing(false);
    });
  }

  const canReview = draft.title.trim().length > 0 && draft.body.trim().length > 0;

  return (
    <div className="article-step-layout">
      <div className="article-step-main">
        <section className="form-section form-section--first" aria-labelledby="aviso-compose-title">
          <h2 id="aviso-compose-title">{draft.id ? "Editar aviso" : "Novo aviso"}</h2>
          <p className="helper-text">
            Destino: todos os leitores (site e, futuramente, aplicativo) que autorizaram a categoria
            <strong> Avisos gerais</strong> — nunca os inscritos só em notícias normais/urgentes. A seleção individual de
            destinatários fica para uma etapa futura.
          </p>

          {!reviewing ? (
            <>
              <label className="form-field">
                <span className="field-label">Título</span>
                <input
                  value={draft.title} maxLength={110} disabled={pending}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </label>
              <label className="form-field">
                <span className="field-label">Mensagem</span>
                <textarea
                  value={draft.body} maxLength={320} rows={4} disabled={pending}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                />
              </label>
              <label className="form-field">
                <span className="field-label">Link interno (opcional)</span>
                <input
                  value={draft.href} maxLength={500} disabled={pending} placeholder="/anuncie"
                  onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
                />
              </label>
              <div className="form-actions">
                <button type="button" className="form-action-primary" disabled={pending || !draft.title.trim() || !draft.body.trim()} onClick={saveDraft}>
                  {pending ? "Salvando…" : "Salvar rascunho"}
                </button>
                <button type="button" disabled={pending || !canReview} onClick={() => setReviewing(true)}>
                  Revisar e enviar
                </button>
                {draft.id ? (
                  <button type="button" disabled={pending} onClick={() => setDraft(blankDraft())}>Novo aviso em branco</button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="aniv-homenagem-message">
                <p className="field-label">Prévia — como aparece no celular</p>
                <div
                  style={{
                    maxWidth: 360, border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px",
                    background: "#f1f2f6", display: "flex", gap: 10, alignItems: "flex-start",
                  }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--brand)", flexShrink: 0 }} aria-hidden="true" />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>Jornal IR</p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700 }}>{draft.title || "(sem título)"}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>{draft.body || "(sem mensagem)"}</p>
                  </div>
                </div>
                {draft.href ? <p className="helper-text" style={{ marginTop: 8 }}>Ao tocar, abre: {draft.href}</p> : null}
              </div>
              {!sendEnabled ? (
                <p className="form-error" role="alert" style={{ marginTop: 12 }}>
                  O envio real de Avisos gerais ainda está desligado (aguardando integração/testes do aplicativo e
                  autorização explícita). Você pode revisar e salvar normalmente, mas "Confirmar envio" não vai alcançar
                  leitores até isso ser ativado.
                </p>
              ) : null}
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button type="button" className="form-action-primary" disabled={pending || !draft.id} onClick={confirmSend}>
                  {pending ? "Enviando…" : "Confirmar envio"}
                </button>
                <button type="button" disabled={pending} onClick={() => setReviewing(false)}>Voltar e editar</button>
              </div>
            </>
          )}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {notice ? <p className="helper-text" role="status">{notice}</p> : null}
        </section>
      </div>

      <aside className="article-step-aside">
        <section className="form-section form-section--compact" aria-labelledby="aviso-history-title">
          <h2 id="aviso-history-title">Histórico</h2>
          {history.length === 0 ? <p className="helper-text">Nenhum aviso preparado ainda.</p> : null}
          <ul className="cadastro-family-tree">
            {history.map((row) => (
              <li key={row.id}>
                <strong>{row.title}</strong> — <span className={`status-pill status-pill--${row.status === "sent" ? "published" : "draft"}`}>{STATUS_LABELS[row.status]}</span>
                {row.status === "draft" ? (
                  <>
                    {" "}
                    <button type="button" className="text-link" onClick={() => startEdit(row)}>Editar</button>{" "}
                    <button type="button" className="text-link" onClick={() => deleteDraft(row.id)}>Excluir</button>
                  </>
                ) : (
                  <span className="helper-text"> enviado em {row.sentAt ? new Date(row.sentAt).toLocaleString("pt-BR") : "—"}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
