"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createAgendaEventAction,
  createPautaFromAgendaEventAction,
  createPautaItemAction,
  setAgendaEventStatusAction,
  setPautaItemStatusAction,
  updateAgendaEventAction,
  updatePautaItemAction,
} from "./actions";
import type { AgendaEventItem, AgendaWorkspaceData, WeeklyPautaItem } from "./agendaTypes";

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

function weekEventOptions(events: AgendaEventItem[], weekStart: string, weekEnd: string): AgendaEventItem[] {
  return events.filter((event) => event.eventDate >= weekStart && event.eventDate <= weekEnd && event.status !== "cancelled");
}

export function AgendaWorkspace({ data, initialView, basePath }: AgendaWorkspaceProps): JSX.Element {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(data.focusDate);
  const [message, setMessage] = useState<string | null>(null);
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [isPending, startTransition] = useTransition();

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
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(data.weekStart, index));
  const weekEvents = weekEventOptions(data.events, data.weekStart, data.weekEnd);
  const monthEventCount = data.events.filter((event) => event.eventDate >= data.monthStart && event.eventDate <= data.monthEnd).length;
  const pautaItems = responsibleFilter
    ? data.pautaItems.filter((item) => item.responsibleProfileId === responsibleFilter)
    : data.pautaItems;

  function navigate(view: "agenda" | "pauta", date: string): void {
    router.push(basePath + "?view=" + view + "&date=" + date);
  }

  function moveMonth(delta: number): void {
    const date = parseDate(data.focusDate);
    date.setDate(1);
    date.setMonth(date.getMonth() + delta);
    navigate("agenda", ymd(date));
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
            run(() => updateAgendaEventAction(item.id, new FormData(event.currentTarget)), "Compromisso atualizado.");
          }}
        >
          <label className="agenda-field agenda-field-wide"><span>Compromisso</span><input name="title" required maxLength={180} defaultValue={item.title} /></label>
          <label className="agenda-field"><span>Data</span><input name="event_date" type="date" required defaultValue={item.eventDate} /></label>
          <label className="agenda-field"><span>Início</span><input name="start_time" type="time" defaultValue={item.startTime ?? ""} /></label>
          <label className="agenda-field"><span>Fim</span><input name="end_time" type="time" defaultValue={item.endTime ?? ""} /></label>
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
            run(() => updatePautaItemAction(item.id, new FormData(event.currentTarget)), "Pauta atualizada.");
          }}
        >
          <input type="hidden" name="week_start" value={item.weekStart} />
          <label className="agenda-field agenda-field-wide"><span>O que precisa ser feito?</span><input name="title" required maxLength={240} defaultValue={item.title} /></label>
          <label className="agenda-field">
            <span>Responsável</span>
            <select name="responsible_profile_id" defaultValue={item.responsibleProfileId ?? ""}>
              <option value="">Sem responsável</option>
              {data.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
          </label>
          <label className="agenda-field">
            <span>Dia</span>
            <select name="due_date" defaultValue={item.dueDate ?? ""}>
              <option value="">Sem dia definido</option>
              {weekDays.map((day) => <option key={day} value={day}>{longDate(day)}</option>)}
            </select>
          </label>
          <label className="agenda-field"><span>Horário</span><input name="due_time" type="time" defaultValue={item.dueTime ?? ""} /></label>
          <label className="agenda-field">
            <span>Vincular à agenda</span>
            <select name="agenda_event_id" defaultValue={item.agendaEventId ?? ""}>
              <option value="">Sem vínculo</option>
              {weekEvents.map((agendaEvent) => <option key={agendaEvent.id} value={agendaEvent.id}>{shortDate(agendaEvent.eventDate)} · {agendaEvent.title}</option>)}
            </select>
          </label>
          <label className="agenda-field agenda-field-wide"><span>Observação</span><textarea name="description" maxLength={4000} defaultValue={item.description ?? ""} /></label>
          <div className="agenda-form-actions"><button type="submit" className="agenda-primary" disabled={isPending}>Salvar alterações</button></div>
        </form>
      </details>
    );
  }

  return (
    <section className="agenda-workspace">
      <div className="agenda-topbar">
        <div className="agenda-tabs" role="tablist" aria-label="Agenda e pauta">
          <button type="button" className={initialView === "agenda" ? "is-active" : ""} onClick={() => navigate("agenda", data.focusDate)}>Agenda</button>
          <button type="button" className={initialView === "pauta" ? "is-active" : ""} onClick={() => navigate("pauta", data.focusDate)}>Pauta da semana</button>
        </div>
        <label className="agenda-person-filter">
          <span>Mostrar</span>
          <select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}>
            <option value="">Toda a equipe</option>
            <option value={data.currentUserId}>Somente meus itens</option>
            {data.profiles.filter((profile) => profile.id !== data.currentUserId).map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </label>
      </div>

      {message ? <div className="agenda-feedback" role="status">{message}</div> : null}

      {initialView === "agenda" ? (
        <div className="agenda-layout">
          <div className="agenda-calendar-card">
            <div className="agenda-calendar-head">
              <button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button>
              <div>
                <strong>{monthLabel(data.focusDate)}</strong>
                <span>{monthEventCount} compromisso{monthEventCount === 1 ? "" : "s"} no mês</span>
              </div>
              <button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button>
            </div>

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
                  <button type="button" key={day.value} className={classes.join(" ")} onClick={() => setSelectedDate(day.value)}>
                    <span className="agenda-day-number">{day.day}</span>
                    {activeEvents.length ? <span className="agenda-day-count">{activeEvents.length}</span> : null}
                  </button>
                );
              })}
            </div>
            <button type="button" className="agenda-today-button" onClick={() => navigate("agenda", data.today)}>Hoje</button>
          </div>

          <div className="agenda-side-column">
            <div className="agenda-day-panel">
              <div className="agenda-section-title"><p className="eyebrow">COMPROMISSOS</p><h2>{longDate(selectedDate)}</h2></div>
              {selectedEvents.length ? (
                <div className="agenda-events-list">
                  {selectedEvents.map((item) => (
                    <article key={item.id} className={"agenda-event-card is-" + item.status}>
                      <div className="agenda-event-main">
                        <div className="agenda-event-time">{item.startTime ?? "—"}{item.endTime ? <small>até {item.endTime}</small> : null}</div>
                        <div>
                          <h3>{item.title}</h3>
                          <div className="agenda-event-meta">
                            {item.location ? <span>{item.location}</span> : null}
                            {item.assignees.length ? <span>{item.assignees.map((person) => person.name).join(", ")}</span> : <span>Sem responsável</span>}
                            <span>{statusLabel(item.status)}</span>
                          </div>
                          {item.description ? <p>{item.description}</p> : null}
                        </div>
                      </div>
                      <div className="agenda-event-actions">
                        {item.status === "scheduled" ? (
                          <>
                            <button type="button" disabled={isPending} onClick={() => run(() => setAgendaEventStatusAction(item.id, "completed"), "Compromisso concluído.")}>✓ Concluir</button>
                            <button type="button" disabled={isPending} onClick={() => run(() => createPautaFromAgendaEventAction(item.id), "Compromisso enviado para a pauta.")}>+ Pauta</button>
                            <button type="button" className="is-danger-soft" disabled={isPending} onClick={() => run(() => setAgendaEventStatusAction(item.id, "cancelled"), "Compromisso cancelado.")}>Cancelar</button>
                          </>
                        ) : (
                          <button type="button" disabled={isPending} onClick={() => run(() => setAgendaEventStatusAction(item.id, "scheduled"), "Compromisso reaberto.")}>Reabrir</button>
                        )}
                      </div>
                      <EventEdit item={item} />
                    </article>
                  ))}
                </div>
              ) : <div className="agenda-empty">Nenhum compromisso neste dia.</div>}
            </div>

            <details className="agenda-create-panel" open>
              <summary>Novo compromisso</summary>
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
                <label className="agenda-field"><span>Repetir compromisso</span><select name="recurrence" defaultValue="none"><option value="none">Não repetir</option><option value="weekly4">Semanal · 4 ocorrências</option><option value="weekly12">Semanal · 12 ocorrências</option><option value="monthly3">Mensal · 3 ocorrências</option></select></label>
                <label className="agenda-field agenda-field-wide"><span>Local</span><input name="location" maxLength={240} placeholder="Opcional" /></label>
                <label className="agenda-field agenda-field-wide"><span>Observação</span><textarea name="description" maxLength={4000} placeholder="Informações úteis para a equipe" /></label>
                <div className="agenda-field-wide"><AssigneeChecks profiles={data.profiles} currentUserId={data.currentUserId} /></div>
                <div className="agenda-form-actions"><button type="submit" className="agenda-primary" disabled={isPending}>{isPending ? "Salvando..." : "Adicionar compromisso"}</button></div>
              </form>
            </details>
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

          <form
            className="pauta-quick-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              run(() => createPautaItemAction(new FormData(form)), "Item adicionado à pauta.", () => form.reset());
            }}
          >
            <input type="hidden" name="week_start" value={data.weekStart} />
            <label className="agenda-field pauta-title-field"><span>O que precisa ser feito?</span><input name="title" required maxLength={240} placeholder="Ex.: Cobrir sessão da Câmara" /></label>
            <label className="agenda-field">
              <span>Responsável</span>
              <select name="responsible_profile_id" defaultValue={data.currentUserId}>
                <option value="">Sem responsável</option>
                {data.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
            <label className="agenda-field">
              <span>Dia</span>
              <select name="due_date" defaultValue="">
                <option value="">Sem dia definido</option>
                {weekDays.map((day) => <option key={day} value={day}>{longDate(day)}</option>)}
              </select>
            </label>
            <label className="agenda-field"><span>Horário</span><input name="due_time" type="time" /></label>
            <label className="agenda-field">
              <span>Vincular à agenda</span>
              <select name="agenda_event_id" defaultValue="">
                <option value="">Sem vínculo</option>
                {weekEvents.map((item) => <option key={item.id} value={item.id}>{shortDate(item.eventDate)} · {item.title}</option>)}
              </select>
            </label>
            <label className="agenda-field pauta-note-field"><span>Observação</span><input name="description" maxLength={4000} placeholder="Opcional" /></label>
            <button type="submit" className="agenda-primary" disabled={isPending}>+ Adicionar</button>
          </form>

          {pautaItems.length ? (
            <div className="pauta-list">
              {pautaItems.map((item) => {
                const done = item.status === "completed";
                const cancelled = item.status === "cancelled";
                return (
                  <article key={item.id} className={"pauta-item" + (done ? " is-done" : "") + (cancelled ? " is-cancelled" : "")}>
                    <button type="button" className="pauta-check" aria-label={done ? "Reabrir item" : "Concluir item"} disabled={isPending || cancelled} onClick={() => run(() => setPautaItemStatusAction(item.id, done ? "pending" : "completed"), done ? "Item reaberto." : "Item concluído.")}>{done ? "✓" : ""}</button>
                    <div className="pauta-item-content">
                      <div className="pauta-item-topline"><strong>{item.title}</strong><span>{item.responsibleName ?? "Sem responsável"}</span></div>
                      <div className="pauta-item-meta">
                        <span>{item.dueDate ? longDate(item.dueDate) : "Sem dia definido"}</span>
                        {item.dueTime ? <span>{item.dueTime}</span> : null}
                        {item.agendaEventTitle ? <span>Agenda: {item.agendaEventTitle}</span> : null}
                      </div>
                      {item.description ? <p>{item.description}</p> : null}
                      {item.articleId ? (
                        <Link href={"/sistema/editorial/materias/" + item.articleId} className="agenda-link-materia">Abrir matéria vinculada ↗</Link>
                      ) : (
                        <Link href={"/sistema/editorial/materias/nova?pauta=" + encodeURIComponent(item.id)} className="agenda-link-materia">+ Criar matéria desta pauta</Link>
                      )}
                      <PautaEdit item={item} />
                    </div>
                    <button type="button" className="pauta-cancel" disabled={isPending} onClick={() => run(() => setPautaItemStatusAction(item.id, cancelled ? "pending" : "cancelled"), cancelled ? "Item restaurado." : "Item retirado da pauta.")}>{cancelled ? "↶" : "×"}</button>
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
