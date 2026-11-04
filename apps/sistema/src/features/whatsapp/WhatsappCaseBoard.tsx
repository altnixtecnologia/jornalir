"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAttendanceCase, setAttendanceCaseStatus, assignAttendanceCase, saveAttendanceCaseNotes,
} from "../../app/sistema/whatsapp/actions";
import {
  WHATSAPP_STATUS_LABELS,
  type WhatsappCase, type WhatsappCaseStatus, type WhatsappStaffOption,
} from "./whatsappTypes";

const WHATSAPP_WEB_URL = "https://web.whatsapp.com/";

type StatusFilter = "all" | WhatsappCaseStatus;
const TABS: { key: StatusFilter; label: string }[] = [
  { key: "pending", label: "Pendentes" },
  { key: "in_progress", label: "Em atendimento" },
  { key: "done", label: "Concluídos" },
  { key: "all", label: "Todos" },
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function WhatsappCaseBoard({
  currentUserId, cases, staff,
}: {
  currentUserId: string;
  cases: WhatsappCase[];
  staff: WhatsappStaffOption[];
}): JSX.Element {
  const router = useRouter();
  const [tab, setTab] = useState<StatusFilter>("pending");
  const [creating, setCreating] = useState(false);
  const [newContact, setNewContact] = useState({ contactName: "", contactPhone: "", notes: "" });
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(
    () => (tab === "all" ? cases : cases.filter((c) => c.status === tab)),
    [cases, tab],
  );
  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const c of cases) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    return byStatus;
  }, [cases]);

  function createCase(): void {
    if (isPending) return;
    setError("");
    startTransition(() => {
      void createAttendanceCase(newContact).then((result) => {
        if ("error" in result) { setError(result.error); return; }
        setNewContact({ contactName: "", contactPhone: "", notes: "" });
        setCreating(false);
        router.refresh();
      });
    });
  }

  function changeStatus(id: string, status: WhatsappCaseStatus): void {
    if (isPending) return;
    startTransition(() => { void setAttendanceCaseStatus(id, status).then(() => router.refresh()); });
  }

  function changeAssignee(id: string, profileId: string): void {
    if (isPending) return;
    startTransition(() => { void assignAttendanceCase(id, profileId || null).then(() => router.refresh()); });
  }

  function changeNotes(id: string, notes: string): void {
    startTransition(() => { void saveAttendanceCaseNotes(id, notes).then(() => router.refresh()); });
  }

  return (
    <div className="whatsapp-board">
      <div className="whatsapp-board-top">
        <a className="cadastros-btn-primary" href={WHATSAPP_WEB_URL} target="_blank" rel="noopener noreferrer">
          Abrir WhatsApp de Atendimento ↗
        </a>
        <p className="helper-text">
          Abre web.whatsapp.com em uma nova aba, usando a sessão já conectada no navegador. Se ainda não estiver
          conectado, faça o vínculo normal pelo WhatsApp (QR Code). O painel abaixo é só um controle interno — não
          sincroniza mensagens automaticamente.
        </p>
      </div>

      <div className="whatsapp-tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key}
            className={`whatsapp-tab${tab === item.key ? " is-active" : ""}`}
            onClick={() => setTab(item.key)}>
            {item.label}
            {item.key !== "all" ? <span className="whatsapp-tab-count">{counts[item.key] ?? 0}</span> : null}
          </button>
        ))}
        <button type="button" className="cadastros-btn-secondary whatsapp-new-case-btn" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancelar" : "+ Novo atendimento"}
        </button>
      </div>

      {creating ? (
        <div className="cadastro-grid whatsapp-new-case-form">
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Nome ou identificação do contato</span>
            <input type="text" value={newContact.contactName}
              onChange={(e) => setNewContact((v) => ({ ...v, contactName: e.target.value }))} />
          </label>
          <label className="cadastro-field cadastro-field--span-3">
            <span className="field-label">Telefone (opcional, só para referência)</span>
            <input type="text" value={newContact.contactPhone}
              onChange={(e) => setNewContact((v) => ({ ...v, contactPhone: e.target.value }))} />
          </label>
          <label className="cadastro-field cadastro-field--span-6">
            <span className="field-label">Observações</span>
            <textarea rows={2} value={newContact.notes}
              onChange={(e) => setNewContact((v) => ({ ...v, notes: e.target.value }))} />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="aniv-entry-actions">
            <button type="button" className="cadastros-btn-primary" disabled={isPending} onClick={createCase}>Salvar</button>
          </div>
        </div>
      ) : null}

      <ul className="whatsapp-case-list">
        {filtered.length === 0 ? <li className="whatsapp-empty">Nenhum atendimento aqui.</li> : null}
        {filtered.map((c) => (
          <li key={c.id} className="whatsapp-case-item">
            <div className="whatsapp-case-main">
              <span className="whatsapp-conversation-name">{c.contactName}</span>
              {c.contactPhone ? <span className="whatsapp-contact-phone">{c.contactPhone}</span> : null}
              <span className={`status-pill status-pill--whatsapp-${c.status}`}>{WHATSAPP_STATUS_LABELS[c.status]}</span>
              <span className="whatsapp-conversation-meta">
                {c.assignedToName ? `Com ${c.assignedToName}` : "Sem responsável"} · atualizado {formatTime(c.updatedAt)}
              </span>
            </div>
            <div className="whatsapp-case-controls">
              <select value={c.status} disabled={isPending} onChange={(e) => changeStatus(c.id, e.target.value as WhatsappCaseStatus)}>
                {(Object.keys(WHATSAPP_STATUS_LABELS) as WhatsappCaseStatus[]).map((key) => (
                  <option key={key} value={key}>{WHATSAPP_STATUS_LABELS[key]}</option>
                ))}
              </select>
              <select value={c.assignedTo ?? ""} disabled={isPending} onChange={(e) => changeAssignee(c.id, e.target.value)}>
                <option value="">Sem responsável</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>{person.id === currentUserId ? `${person.name} (eu)` : person.name}</option>
                ))}
              </select>
            </div>
            <textarea className="whatsapp-case-notes" rows={2} defaultValue={c.notes ?? ""} placeholder="Observações…"
              onBlur={(e) => { if (e.target.value.trim() !== (c.notes ?? "")) changeNotes(c.id, e.target.value); }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
