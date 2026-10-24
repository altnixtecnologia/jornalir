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
