"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  completeMyAgendaAssignmentAction,
  completeMyPautaItemAction,
  createAgendaEventAction,
  createPautaFromAgendaEventAction,
  createPautaItemAction,
  setAgendaEventStatusAction,
  setPautaItemStatusAction,
  updateAgendaEventAction,
  updatePautaItemAction,
} from "./actions";
import type { AgendaEventItem, AgendaWorkspaceData, WeeklyPautaItem } from "./agendaTypes";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

interface AgendaWorkspaceProps {
  data: AgendaWorkspaceData;
  initialView: "agenda" | "pauta";
  basePath: "/sistema/agenda" | "/agenda";
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function ymd(date: Date): string {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return ymd(date);
}

function shortDate(value: string): string {
  return parseDate(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function longDate(value: string): string {
  return parseDate(value).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

function monthLabel(value: string): string {
  const text = parseDate(value).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Cor deterministica derivada do UUID: mesmo responsavel, mesma cor
 * no computador e no aplicativo, sem depender da ordem de cadastro.
 */
function personColor(id: string): string {
  if (!id) return "hsl(215 18% 48%)";
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return `hsl(${(hash >>> 0) % 360} 62% 38%)`;
}

function statusLabel(status: string): string {
  if (status === "completed") return "Concluído";
  if (status === "cancelled") return "Cancelado";
  return "Agendado";
}

function AssigneeChecks({
  profiles,
  selectedIds,
  currentUserId,
}: {
  profiles: AgendaWorkspaceData["profiles"];
  selectedIds?: string[];
  currentUserId?: string;
}): JSX.Element {
  const selected = new Set(selectedIds ?? (currentUserId ? [currentUserId] : []));
  return (
    <fieldset className="agenda-assignees">
      <legend>Responsáveis</legend>
      {profiles.length === 0 ? <span className="helper-text">Nenhum usuário ativo.</span> : profiles.map((profile) => (
        <label key={profile.id}>
          <input
            type="checkbox"
            name="assignee_profile_ids"
            value={profile.id}
            defaultChecked={selected.has(profile.id)}
          />
          <span>{profile.name}</span>
        </label>
      ))}
    </fieldset>
  );
}


/** Um unico seletor nativo de dia e horario no mobile.
 * Mantem as duas chaves historicas aceitas pelas actions do Supabase.
 * Registros antigos sem hora continuam sem hora ate serem editados.
 */
function PautaDateTimeField({
  initialDate,
  initialTime,
  weekStart,
  weekEnd,
  required = false,
}: {
  initialDate: string;
  initialTime: string | null;
  weekStart: string;
  weekEnd: string;
  required?: boolean;
}): JSX.Element {
  return (
    <div className="agenda-field pauta-datetime-field">
      <label htmlFor={required ? "new-pauta-date-time" : undefined}>
        Data e horário{required ? "" : " (opcional alterar)"}
      </label>
      <input name="due_date" type="hidden" defaultValue={initialDate} />
      <input name="due_time" type="hidden" defaultValue={initialTime ?? ""} />
      <input
        id={required ? "new-pauta-date-time" : undefined}
        type="datetime-local"
        aria-label="Selecionar data e horário da pauta"
        min={weekStart + "T00:00"}
        max={weekEnd + "T23:59"}
        defaultValue={initialTime ? initialDate + "T" + initialTime.slice(0, 5) : ""}
        required={required}
        onChange={(event) => {
          const value = event.currentTarget.value;
          const form = event.currentTarget.form;
          const date = form?.elements.namedItem("due_date") as HTMLInputElement | null;
          const time = form?.elements.namedItem("due_time") as HTMLInputElement | null;
          if (date) date.value = value.length >= 10 ? value.slice(0, 10) : initialDate;
          if (time) time.value = value.length >= 16 ? value.slice(11, 16) : "";
        }}
      />
      {!required && !initialTime ? <small>Esta pauta ainda não possui horário definido.</small> : null}
    </div>
  );
}

export function AgendaWorkspace({ data, initialView, basePath }: AgendaWorkspaceProps): JSX.Element {
  const router = useRouter();
  const realtimeClient = useMemo(() => createSupabaseBrowserClient(), []);
  const [selectedDate, setSelectedDate] = useState(data.focusDate);
  const [realtimeState, setRealtimeState] = useState<"connecting" | "online" | "offline">("connecting");
  const [remoteChanges, setRemoteChanges] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [isMonthExpanded, setIsMonthExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setSelectedDate(data.focusDate), [data.focusDate]);

  // Atualizacao em tempo real + reconciliacao ao voltar ao navegador.
  // A regra de acesso continua sendo a RLS do Supabase, nao o canal.
  useEffect(() => {
    let pendingRefresh: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      // Nao descartar campos ainda nao salvos quando colegas atualizam o banco.
      if (document.querySelector(".agenda-inline-edit[open],.agenda-create-panel[open],.pauta-create-panel[open]")) {
        setRemoteChanges(true);
        return;
      }
      if (pendingRefresh) clearTimeout(pendingRefresh);
      pendingRefresh = setTimeout(() => router.refresh(), 450);
    };
    const channel = realtimeClient.channel("agenda-equipe-" + data.currentUserId)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_events" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_event_assignees" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_pauta_items" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("online");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("offline");
      });
    const onFocus = () => refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (pendingRefresh) clearTimeout(pendingRefresh);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      void realtimeClient.removeChannel(channel);
    };
  }, [data.currentUserId, realtimeClient, router]);

  const days = useMemo(() => {
    const month = parseDate(data.focusDate);
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const weekday = first.getDay();
    const offset = weekday === 0 ? 6 : weekday - 1;
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - offset, 12);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { value: ymd(date), day: date.getDate(), currentMonth: date.getMonth() === month.getMonth() };
    });
  }, [data.focusDate]);

  const filteredEvents = useMemo(
    () => responsibleFilter
      ? data.events.filter((event) => event.assignees.some((profile) => profile.id === responsibleFilter))
      : data.events,
    [data.events, responsibleFilter],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, typeof data.events>();
    for (const event of filteredEvents) {
      const list = map.get(event.eventDate) ?? [];
      list.push(event);
      map.set(event.eventDate, list);
    }
    return map;
  }, [filteredEvents]);

  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  // Navegacao semanal no celular: o mes completo continua disponivel sob demanda.
  const selectedWeekday = (parseDate(selectedDate).getDay() + 6) % 7;
  const selectedWeekStart = addDays(selectedDate, -selectedWeekday);
  const selectedWeekDays = Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index));
  const todayCount = filteredEvents.filter((event) => event.eventDate === data.today && event.status !== "cancelled").length;
  const ownPending = data.events.filter((event) =>
    event.status === "scheduled" && event.assignees.some((person) =>
      person.id === data.currentUserId && !person.completedAt)).length +
    data.pautaItems.filter((item) =>
      item.status === "pending" && item.responsibleProfileId === data.currentUserId && !item.agendaEventId).length;
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(data.weekStart, index));
  const initialPautaDate = data.today >= data.weekStart && data.today <= data.weekEnd ? data.today : data.weekStart;
  const monthEventCount = data.events.filter((event) => event.eventDate >= data.monthStart && event.eventDate <= data.monthEnd).length;
  const pautaItems = responsibleFilter
    ? data.pautaItems.filter((item) => item.responsibleProfileId === responsibleFilter || item.assignees.some((person) => person.id === responsibleFilter))
    : data.pautaItems;

  function navigate(view: "agenda" | "pauta", date: string): void {
    const path = basePath === "/sistema/agenda"
      ? (view === "pauta" ? "/sistema/pauta" : "/sistema/agenda")
      : basePath + "?view=" + view;
    router.push(path + (path.includes("?") ? "&date=" : "?date=") + date);
  }

  function moveMonth(delta: number): void {
    const date = parseDate(data.focusDate);
    date.setDate(1);
    date.setMonth(date.getMonth() + delta);
    navigate("agenda", ymd(date));
  }

  function openCreate(): void {
    const id = initialView === "agenda" ? "agenda-create-panel" : "pauta-create-panel";
    const node = document.getElementById(id);
    if (!node) return;
    if (node instanceof HTMLDetailsElement) node.open = true;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = node.querySelector<HTMLInputElement>('input[name="title"]');
    if (input) window.setTimeout(() => input.focus({ preventScroll: true }), 280);
  }

  function moveWeek(delta: number): void {
    navigate("pauta", addDays(data.weekStart, delta * 7));
  }

  function run(
    action: () => Promise<{ ok: true } | { error: string }>,
    success: string,
    reset?: () => void,
  ): void {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setMessage(result.error);
        return;
      }
      reset?.();
      setMessage(success);
      setRemoteChanges(false);
      router.refresh();
    });
  }

  function EventEdit({ item }: { item: AgendaEventItem }): JSX.Element {
    return (
      <details className="agenda-inline-edit">
        <summary>Editar</summary>
        <form
          className="agenda-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            run(() => updateAgendaEventAction(item.id, new FormData(form)), "Compromisso atualizado.");
          }}
        >
          <input type="hidden" name="updated_at" value={item.updatedAt} />
          <label className="agenda-field agenda-field-wide"><span>Compromisso</span><input name="title" required maxLength={180} defaultValue={item.title} /></label>
          <label className="agenda-field"><span>Data</span><input name="event_date" type="date" required defaultValue={item.eventDate} /></label>
          <label className="agenda-field"><span>Início</span><input name="start_time" type="time" defaultValue={item.startTime ?? ""} /></label>
          <label className="agenda-field"><span>Fim</span><input name="end_time" type="time" defaultValue={item.endTime ?? ""} /></label>
          <label className="agenda-field"><span>Lembrete no grupo Telegram</span><select name="reminder_minutes" defaultValue={item.reminderMinutes === null ? "off" : String(item.reminderMinutes)}><option value="off">Sem lembrete</option><option value="0">No horário</option><option value="5">5 min antes</option><option value="10">10 min antes</option><option value="15">15 min antes</option><option value="30">30 min antes</option><option value="60">1 hora antes</option><option value="120">2 horas antes</option><option value="1440">1 dia antes</option></select></label>
          <label className="agenda-field agenda-field-wide"><span>Local</span><input name="location" maxLength={240} defaultValue={item.location ?? ""} /></label>
          <label className="agenda-field agenda-field-wide"><span>Observação</span><textarea name="description" maxLength={4000} defaultValue={item.description ?? ""} /></label>
          <div className="agenda-field-wide"><AssigneeChecks profiles={data.profiles} selectedIds={item.assignees.map((profile) => profile.id)} /></div>
          <div className="agenda-form-actions"><button type="submit" className="agenda-primary" disabled={isPending}>Salvar alterações</button></div>
        </form>
      </details>
    );
  }

  function PautaEdit({ item }: { item: WeeklyPautaItem }): JSX.Element {
    return (
      <details className="agenda-inline-edit pauta-inline-edit">
        <summary>Editar</summary>
        <form
          className="agenda-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            run(() => updatePautaItemAction(item.id, new FormData(form)), "Pauta atualizada.");
          }}
        >
          <input type="hidden" name="week_start" value={item.weekStart} />
          <input type="hidden" name="updated_at" value={item.updatedAt} />
          <label className="agenda-field agenda-field-wide"><span>O que precisa ser feito?</span><input name="title" required maxLength={180} defaultValue={item.title} /></label>
          <div className="agenda-field-wide"><AssigneeChecks profiles={data.profiles} selectedIds={item.assignees.map((person) => person.id)} /></div>
          <PautaDateTimeField initialDate={item.dueDate ?? item.weekStart} initialTime={item.dueTime} weekStart={item.weekStart} weekEnd={addDays(item.weekStart, 6)} />
          <label className="agenda-field agenda-field-wide"><span>Observação</span><textarea name="description" maxLength={4000} defaultValue={item.description ?? ""} /></label>
          <div className="agenda-form-actions"><button type="submit" className="agenda-primary" disabled={isPending}>Salvar alterações</button></div>
        </form>
      </details>
    );
  }

  return (
    <section className="agenda-workspace">
      <div className="agenda-quick-overview" aria-label="Resumo dos compromissos">
        <div><span>Hoje</span><strong>{todayCount}</strong><small>compromissos</small></div>
        <div><span>Minha fila</span><strong>{ownPending}</strong><small>pendências</small></div>
        <div className="agenda-quick-sync" title="Atualizacao automatica e sincronizacao ao retomar a aba">
          <span className={"agenda-sync-dot is-" + realtimeState} />
          <strong>{realtimeState === "online" ? "Ao vivo" : realtimeState === "connecting" ? "Conectando" : "Sem conexão em tempo real"}</strong>
          <small>{realtimeState === "online" ? "Atualização em tempo real ativa" : "Atualiza ao reconectar"}</small>
        </div>
      </div>
      <div className="agenda-topbar">
        {basePath === "/agenda" ? <div className="agenda-tabs" role="tablist" aria-label="Agenda e pauta">
          {data.access.agendaRead ? <button type="button" className={initialView === "agenda" ? "is-active" : ""} onClick={() => navigate("agenda", data.focusDate)}>Agenda</button> : null}
          {data.access.pautaRead ? <button type="button" className={initialView === "pauta" ? "is-active" : ""} onClick={() => navigate("pauta", data.focusDate)}>Pauta da semana</button> : null}
        </div> : null}
        <label className="agenda-person-filter">
          <span>Mostrar</span>
          <select aria-label="Filtrar por responsável" value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}>
            <option value="">Toda a equipe</option>
            <option value={data.currentUserId}>Somente meus itens</option>
            {data.profiles.filter((profile) => profile.id !== data.currentUserId).map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </label>
        {(initialView === "agenda" ? data.access.agendaWrite : data.access.pautaWrite) ? (
          <button type="button" className="agenda-top-add" onClick={openCreate}>{initialView === "agenda" ? "+ Compromisso" : "+ Nova pauta"}</button>
        ) : null}
      </div>

      {remoteChanges ? (
        <div className="agenda-remote-notice" role="status">
          A equipe atualizou a agenda. Salve ou feche o formulário antes de atualizar.
          <button type="button" onClick={() => { setRemoteChanges(false); router.refresh(); }}>Atualizar agora</button>
        </div>
      ) : null}
      {message ? <div className="agenda-feedback" role="status">{message}</div> : null}

      {initialView === "agenda" && data.access.agendaRead ? (
        <div className="agenda-layout">
          <div className="agenda-calendar-card">
            <div className="agenda-calendar-head">
              <button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button>
              <div>
                <strong>{monthLabel(data.focusDate)}</strong>
                <span>{monthEventCount} compromisso{monthEventCount === 1 ? "" : "s"} no mês</span>
                <button type="button" className="agenda-month-toggle" aria-expanded={isMonthExpanded} aria-controls="agenda-month-detail" onClick={() => setIsMonthExpanded((expanded) => !expanded)}>{isMonthExpanded ? "Fechar mês" : "Ver mês"}</button>
              </div>
              <button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button>
            </div>

            <div className="agenda-week-strip" aria-label="Semana selecionada">
              <button type="button" className="agenda-week-step" aria-label="Semana anterior" onClick={() => navigate("agenda", addDays(selectedDate, -7))}>‹</button>
              <div className="agenda-week-dates">
                {selectedWeekDays.map((day, index) => {
                  const count = (eventsByDate.get(day) ?? []).filter((event) => event.status !== "cancelled").length;
                  return (
                    <button type="button" key={day} aria-label={longDate(day)} aria-pressed={selectedDate === day}
                      className={"agenda-week-date" + (selectedDate === day ? " is-selected" : "") + (day === data.today ? " is-today" : "")}
                      onClick={() => {
                        if (day < data.monthStart || day > data.monthEnd) navigate("agenda", day);
                        else setSelectedDate(day);
                      }}>
                      <small>{["S", "T", "Q", "Q", "S", "S", "D"][index]}</small>
                      <strong>{parseDate(day).getDate()}</strong>
                      {count > 0 ? <i aria-label={count + " compromissos"} /> : null}
                    </button>
                  );
                })}
              </div>
              <button type="button" className="agenda-week-step" aria-label="Próxima semana" onClick={() => navigate("agenda", addDays(selectedDate, 7))}>›</button>
            </div>
            <div id="agenda-month-detail" className={"agenda-month-detail" + (isMonthExpanded ? " is-expanded" : "")}>
              <div className="agenda-weekdays">{["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="agenda-month-grid">
              {days.map((day) => {
                const dayEvents = eventsByDate.get(day.value) ?? [];
                const activeEvents = dayEvents.filter((event) => event.status !== "cancelled");
                const classes = ["agenda-day"];
                if (!day.currentMonth) classes.push("is-outside");
                if (day.value === selectedDate) classes.push("is-selected");
                if (day.value === data.today) classes.push("is-today");
                return (
                  <button type="button" key={day.value} className={classes.join(" ")} onClick={() => {
                    if (day.value < data.monthStart || day.value > data.monthEnd) navigate("agenda", day.value);
                    else setSelectedDate(day.value);
                  }}>
                    <span className="agenda-day-number">{day.day}</span>
                    {activeEvents.length ? <span className="agenda-day-count">{activeEvents.length}</span> : null}
                    {activeEvents.length ? <span className="agenda-day-colors" aria-hidden="true">
                      {activeEvents.slice(0, 4).map((event) => <i key={event.id} style={{ background: personColor(event.assignees[0]?.id ?? "") }} />)}
                    </span> : null}
                  </button>
                );
              })}
            </div>
            </div>
            <button type="button" className="agenda-today-button" onClick={() => navigate("agenda", data.today)}>Hoje</button>
          </div>

          <div className="agenda-side-column">
            <div className="agenda-day-panel">
              <div className="agenda-section-title"><p className="eyebrow">COMPROMISSOS</p><h2>{longDate(selectedDate)}</h2></div>
              {selectedEvents.length ? (
                <div className="agenda-events-list">
                  {selectedEvents.map((item) => (
                    <article key={item.id} className={"agenda-event-card is-" + item.status}
                      style={{ borderLeftColor: personColor(item.assignees[0]?.id ?? "") }}>
                      <div className="agenda-event-main">
                        <div className="agenda-event-time">{item.startTime ? item.startTime + "h" : "—"}{item.endTime ? <small>até {item.endTime}h</small> : null}</div>
                        <div>
                          <h3>{item.title}</h3>
                          <div className="agenda-event-meta">
                            {item.location ? <span>{item.location}</span> : null}
                            {item.assignees.length ? <span className="agenda-assignee-row">
                              {item.assignees.map((person) => (
                                <span className="agenda-assignee-chip" key={person.id} style={{ borderColor: personColor(person.id), color: personColor(person.id) }}>
                                  {person.completedAt ? "✓ " : ""}{person.name}
                                </span>
                              ))}
                            </span> : <span>Sem responsável</span>}
                            <span className="agenda-event-state">{statusLabel(item.status)}{item.assignees.length > 1 ? ` · ${item.assignees.filter((person) => person.completedAt).length}/${item.assignees.length} concluídos` : ""}</span>
                          </div>
                          {item.description ? <details className="agenda-event-details"><summary>Visualizar detalhes</summary><p>{item.description}</p></details> : null}
                        </div>
                      </div>
                      {(data.access.agendaWrite || item.assignees.some((person) => person.id === data.currentUserId)) ? <div className="agenda-event-actions">
                        {item.status === "scheduled" ? (
                          <>
                            {item.assignees.some((person) => person.id === data.currentUserId && !person.completedAt) ? (
                              <button type="button" className="agenda-complete-button" disabled={isPending}
                                onClick={() => run(() => completeMyAgendaAssignmentAction(item.id), "Sua parte foi concluída.")}>✓ Concluir minha parte</button>
                            ) : null}
                            {data.access.agendaWrite ? <button type="button" disabled={isPending} onClick={() => run(() => setAgendaEventStatusAction(item.id, "completed"), "Compromisso concluído pela administração.")}>{item.assignees.length ? "✓ Concluir todos" : "✓ Concluir"}</button> : null}
                            {data.access.pautaWrite && item.eventKind !== "editorial" ? <button type="button" disabled={isPending} onClick={() => run(() => createPautaFromAgendaEventAction(item.id), "Compromisso incluído na pauta.")}>+ Incluir na Pauta</button> : null}
                            {data.access.agendaWrite ? <button type="button" className="is-danger-soft" disabled={isPending} onClick={() => run(() => setAgendaEventStatusAction(item.id, "cancelled"), "Compromisso cancelado.")}>Cancelar</button> : null}
                          </>
                        ) : data.access.agendaWrite ? (
                          <button type="button" disabled={isPending} onClick={() => run(() => setAgendaEventStatusAction(item.id, "scheduled"), "Compromisso reaberto.")}>Reabrir</button>
                        ) : null}
                      </div> : null}
                      {data.access.agendaWrite ? <EventEdit item={item} /> : null}
                    </article>
                  ))}
                </div>
              ) : <div className="agenda-empty">Nenhum compromisso neste dia.</div>}
            </div>

            {data.access.agendaWrite ? <details className="agenda-create-panel" id="agenda-create-panel">
              <summary>+ Novo compromisso <span>Toque para cadastrar</span></summary>
              <form
                className="agenda-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  run(() => createAgendaEventAction(new FormData(form)), "Compromisso adicionado.", () => {
                    form.reset();
                    const dateInput = form.elements.namedItem("event_date") as HTMLInputElement | null;
                    if (dateInput) dateInput.value = selectedDate;
                  });
                }}
              >
                <label className="agenda-field agenda-field-wide"><span>Compromisso</span><input name="title" required maxLength={180} placeholder="Ex.: Sessão da Câmara" /></label>
                <label className="agenda-field"><span>Data</span><input name="event_date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} required /></label>
                <label className="agenda-field"><span>Início</span><input name="start_time" type="time" /></label>
                <label className="agenda-field"><span>Fim</span><input name="end_time" type="time" /></label>
                <label className="agenda-field"><span>Lembrete no grupo Telegram</span><select name="reminder_minutes" defaultValue="30"><option value="off">Sem lembrete</option><option value="0">No horário</option><option value="5">5 min antes</option><option value="10">10 min antes</option><option value="15">15 min antes</option><option value="30">30 min antes</option><option value="60">1 hora antes</option><option value="120">2 horas antes</option><option value="1440">1 dia antes</option></select></label>
                <label className="agenda-field"><span>Repetir compromisso</span><select name="recurrence" defaultValue="none"><option value="none">Não repetir</option><option value="weekly4">Semanal · 4 ocorrências</option><option value="weekly12">Semanal · 12 ocorrências</option><option value="monthly3">Mensal · 3 ocorrências</option></select></label>
                <label className="agenda-field agenda-field-wide"><span>Local</span><input name="location" maxLength={240} placeholder="Opcional" /></label>
                <label className="agenda-field agenda-field-wide"><span>Observação</span><textarea name="description" maxLength={4000} placeholder="Informações úteis para a equipe" /></label>
                <div className="agenda-field-wide"><AssigneeChecks profiles={data.profiles} currentUserId={data.currentUserId} /></div>
                <div className="agenda-form-actions"><button type="submit" className="agenda-primary" disabled={isPending}>{isPending ? "Salvando..." : "Adicionar compromisso"}</button></div>
              </form>
            </details> : null}
          </div>
        </div>
      ) : (
        <div className="pauta-layout">
          <div className="pauta-week-head">
            <button type="button" onClick={() => moveWeek(-1)} aria-label="Semana anterior">‹</button>
            <div><p className="eyebrow">PAUTA DA SEMANA</p><h2>{shortDate(data.weekStart)} a {shortDate(data.weekEnd)}</h2></div>
            <button type="button" onClick={() => moveWeek(1)} aria-label="Próxima semana">›</button>
          </div>

          <div className="pauta-actions-row">
            <button type="button" onClick={() => navigate("pauta", data.today)}>Semana atual</button>
            <span>{pautaItems.filter((item) => item.status === "pending").length} pendente(s)</span>
          </div>

          {data.access.pautaWrite ? <details className="pauta-create-panel" id="pauta-create-panel"><summary>+ Nova pauta <span>Toque para cadastrar</span></summary><form
            className="pauta-quick-form"
            key={data.weekStart}
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              run(() => createPautaItemAction(new FormData(form)), "Pauta criada e sincronizada com a Agenda.", () => form.reset());
            }}
          >
            <input type="hidden" name="week_start" value={data.weekStart} />
            <label className="agenda-field pauta-title-field"><span>O que precisa ser feito?</span><input name="title" required maxLength={180} placeholder="Ex.: Cobrir sessão da Câmara" /></label>
            <div className="agenda-field-wide"><AssigneeChecks profiles={data.profiles} currentUserId={data.currentUserId} /></div>
            <PautaDateTimeField initialDate={initialPautaDate} initialTime={null} weekStart={data.weekStart} weekEnd={data.weekEnd} required />
            <label className="agenda-field pauta-note-field"><span>Observação</span><input name="description" maxLength={4000} placeholder="Opcional" /></label>
            <button type="submit" className="agenda-primary" disabled={isPending}>+ Criar na Agenda e Pauta</button>
          </form></details> : null}

          {pautaItems.length ? (
            <div className="pauta-list">
              {pautaItems.map((item) => {
                const done = item.status === "completed";
                const cancelled = item.status === "cancelled";
                const myAssignment = item.assignees.find((person) => person.id === data.currentUserId);
                const canCompleteOwn = !done && !cancelled && Boolean(myAssignment && !myAssignment.completedAt);
                return (
                  <article key={item.id} style={{ borderLeftColor: personColor(item.responsibleProfileId ?? "") }} className={"pauta-item" + (done ? " is-done" : "") + (cancelled ? " is-cancelled" : "")}>
                    {(data.access.pautaWrite || canCompleteOwn) ? <button type="button" className="pauta-check"
                      aria-label={done ? "Reabrir item" : "Concluir minha pauta"} disabled={isPending || cancelled}
                      onClick={() => run(
                        () => done ? setPautaItemStatusAction(item.id, "pending")
                          : data.access.pautaWrite && !canCompleteOwn ? setPautaItemStatusAction(item.id, "completed") : completeMyPautaItemAction(item.id),
                        done ? "Item reaberto." : "Item concluído.",
                      )}>{done ? "✓" : ""}</button> : <span className="pauta-check-placeholder" aria-hidden="true">{done ? "✓" : ""}</span>}
                    <div className="pauta-item-content">
                      <div className="pauta-item-topline"><strong>{item.title}</strong><span className="agenda-assignee-row">
                          {item.assignees.length ? item.assignees.map((person) => (
                            <span key={person.id} className="agenda-assignee-chip" style={{ borderColor: personColor(person.id), color: personColor(person.id) }}>
                              {person.completedAt ? "✓ " : ""}{person.name}
                            </span>
                          )) : <span className="agenda-assignee-chip">Sem responsável</span>}
                        </span></div>
                      <div className="pauta-item-meta">
                        <span>{item.dueDate ? longDate(item.dueDate) : "Sem dia definido"}</span>
                        {item.dueTime ? <span>{item.dueTime}h</span> : null}
                        <span>{done ? "Concluída" : cancelled ? "Cancelada" : item.assignees.some((person) => person.completedAt) ? "Em andamento" : "Pendente"}</span>
                      </div>
                      {item.description ? <p>{item.description}</p> : null}
                      {item.articleId ? (
                        <Link href={"/sistema/editorial/materias/" + item.articleId} className="agenda-link-materia">Abrir matéria vinculada ↗</Link>
                      ) : data.access.editorialLinkAccess ? (
                        <Link href={"/sistema/editorial/materias/nova?pauta=" + encodeURIComponent(item.id)} className="agenda-link-materia">+ Criar matéria desta pauta</Link>
                      ) : null}
                      {data.access.pautaWrite ? <PautaEdit item={item} /> : null}
                    </div>
                    {data.access.pautaWrite ? <button type="button" className="pauta-cancel" disabled={isPending} onClick={() => run(() => setPautaItemStatusAction(item.id, cancelled ? "pending" : "cancelled"), cancelled ? "Item restaurado." : "Item retirado da pauta.")}>{cancelled ? "↶" : "×"}</button> : null}
                  </article>
                );
              })}
            </div>
          ) : <div className="agenda-empty">Nenhuma pauta registrada para esta semana.</div>}
        </div>
      )}
    </section>
  );
}
