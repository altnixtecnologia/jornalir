/**
 * Regras puras dos avisos individuais de convite da Agenda.
 * O Telegram de grupo e os lembretes de tarefas continuam independentes.
 */
export type AgendaInvitationRow = {
  event_id: string;
  profile_id: string;
  invited_at: string;
  status: string;
};
export type AgendaInvitationMeeting = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  status: string;
  event_kind: string;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function agendaInvitationDedupeKey(invite: AgendaInvitationRow): string {
  return ["agenda", "invite", invite.event_id, invite.profile_id, invite.invited_at].join(":");
}

export function buildAgendaInvitationNotification(
  invite: AgendaInvitationRow,
  meeting: AgendaInvitationMeeting | undefined,
  nowIso: string,
  nowLocal: string,
): { app_kind: "sistema"; kind: "agenda"; target_profile_id: string; title: string; body: string; href: string; dedupe_key: string; scheduled_at: string } | null {
  const now = Date.parse(nowIso);
  const invitedAt = Date.parse(invite.invited_at);
  if (!meeting || invite.status !== "pending" || meeting.status !== "scheduled" || meeting.event_kind !== "general") return null;
  // Cron desligado por muito tempo não dispara convites antigos em massa.
  if (!Number.isFinite(now) || !Number.isFinite(invitedAt) ||
      invitedAt > now + 60_000 || invitedAt < now - ONE_DAY_MS) return null;
  if (meeting.event_date < nowLocal.slice(0, 10)) return null;
  if (meeting.start_time &&
      meeting.event_date + "T" + meeting.start_time.slice(0, 5) <= nowLocal) return null;

  const date = meeting.event_date.split("-").reverse().join("/");
  const time = meeting.start_time ? " às " + meeting.start_time.slice(0, 5) + "h" : "";
  return {
    app_kind: "sistema",
    kind: "agenda",
    target_profile_id: invite.profile_id,
    title: "📅 Convite para reunião: " + meeting.title.slice(0, 105),
    body: "Você foi convidado para " + date + time + ". Abra a Agenda para aceitar ou recusar.",
    href: "/sistema/agenda?date=" + encodeURIComponent(meeting.event_date),
    dedupe_key: agendaInvitationDedupeKey(invite),
    scheduled_at: nowIso,
  };
}

/** Revalidar imediatamente antes do push; resposta/cancelamento podem ter mudado após a fila. */
export function agendaInvitationStillPending(
  dedupeKey: string | null,
  eventTarget: string | null,
  invite: { status: string; invited_at: string } | null,
  meeting: { status: string; event_kind: string } | null,
): boolean {
  if (!dedupeKey || !dedupeKey.startsWith("agenda:invite:") || !eventTarget || !invite || !meeting) return false;
  const match = /^agenda:invite:([0-9a-f-]{36}):([0-9a-f-]{36}):(.+)$/i.exec(dedupeKey);
  if (!match || match[2] !== eventTarget) return false;
  return invite.status === "pending" &&
    meeting.status === "scheduled" && meeting.event_kind === "general" &&
    Number.isFinite(Date.parse(match[3])) &&
    Date.parse(match[3]) === Date.parse(invite.invited_at);
}

/** O convidado que aceitou recebe lembrete de reunião, mas não alerta de tarefa atrasada. */
export function agendaReminderRecipients(
  assigned: Array<{ profile_id: string; completed_at: string | null }>,
  accepted: Array<{ profile_id: string }>,
): Array<{ profile_id: string; completed_at: string | null; meetingOnly: boolean }> {
  const responsible = assigned.map((p) => ({ ...p, meetingOnly: false }));
  const seen = new Set(assigned.map((p) => p.profile_id));
  for (const attendee of accepted) {
    if (seen.has(attendee.profile_id)) continue;
    seen.add(attendee.profile_id);
    responsible.push({ profile_id: attendee.profile_id, completed_at: null, meetingOnly: true });
  }
  return responsible;
}

/** Determina se um lembrete anteriormente enfileirado ainda é válido.
 * Regras de autorização/consentimento do dispositivo continuam no cron.
 */
export type AgendaReminderMeeting = {
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  reminder_minutes: number | null;
  status: string;
  event_kind: string;
};

function shiftLocalMinute(local: string, delta: number): string {
  const date = new Date(local + ":00Z");
  date.setUTCMinutes(date.getUTCMinutes() + delta);
  return date.toISOString().slice(0, 16);
}

export function currentAgendaReminderPush(
  dedupeKey: string,
  recipientId: string,
  event: AgendaReminderMeeting | null,
  assignment: { completed_at: string | null } | null,
  invitationStatus: string | null,
  nowLocal: string,
): { title: string; body: string; href: string } | null {
  const key = /^agenda:(reminder|overdue):([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):([0-9a-f-]{36})$/i.exec(dedupeKey);
  if (!key || key[4] !== recipientId || !event || event.status !== "scheduled") return null;
  const category = key[1];
  const isResponsible = Boolean(assignment && !assignment.completed_at);
  const guestOnly = !assignment && event.event_kind === "general" && invitationStatus === "accepted";
  if (!isResponsible && !(category === "reminder" && guestOnly)) return null;

  const dateTime = event.event_date + "T" + (event.start_time?.slice(0, 5) || "00:00");
  const reminderAt = event.start_time && event.reminder_minutes !== null
    ? shiftLocalMinute(dateTime, -event.reminder_minutes) : null;
  const overdueAt = event.end_time
    ? shiftLocalMinute(event.event_date + "T" + event.end_time.slice(0, 5), 10)
    : event.start_time ? shiftLocalMinute(dateTime, 15)
    : shiftLocalMinute(event.event_date + "T08:00", 1440);
  const expected = category === "reminder" ? reminderAt : overdueAt;
  const windowMinutes = category === "reminder" ? 10 : 60;
  if (!expected || expected !== key[3] || expected > nowLocal ||
      shiftLocalMinute(expected, windowMinutes) <= nowLocal) return null;

  return {
    title: (category === "overdue" ? "⚠ Compromisso atrasado: " : "📅 ") + event.title.slice(0, 105),
    body: category === "overdue"
      ? "O prazo terminou. Abra a Agenda para concluir ou reagendar."
      : "Compromisso: " + event.event_date.split("-").reverse().join("/")
        + " às " + event.start_time!.slice(0, 5) + "h",
    href: "/sistema/agenda?date=" + encodeURIComponent(event.event_date),
  };
}
