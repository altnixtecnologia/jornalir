export interface AgendaProfile {
  id: string;
  name: string;
  role: string;
}

export interface AgendaEventItem {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  reminderMinutes: number | null;
  eventKind: "general" | "editorial";
  completedAt: string | null;
  updatedAt: string;
  location: string | null;
  status: "scheduled" | "completed" | "cancelled";
  assignees: (AgendaProfile & { completedAt: string | null })[];
  /** Confirmação de presença de reunião, independente de tarefa concluída. */
  invitees: (AgendaProfile & { response: "pending" | "accepted" | "declined"; respondedAt: string | null })[];
}

export interface WeeklyPautaItem {
  id: string;
  weekStart: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  dueTime: string | null;
  responsibleProfileId: string | null;
  responsibleName: string | null;
  agendaEventId: string | null;
  agendaEventTitle: string | null;
  articleId: string | null;
  status: "pending" | "completed" | "cancelled";
  completedAt: string | null;
  assignees: (AgendaProfile & { completedAt: string | null })[];
  updatedAt: string;
}

/** Convites a compromissos ainda agendados, inclusive fora do mês em tela. */
export interface PendingMeetingInvitation {
  eventId: string;
  title: string;
  eventDate: string;
  startTime: string | null;
  location: string | null;
}

export interface AgendaWorkspaceData {
  focusDate: string;
  today: string;
  monthStart: string;
  monthEnd: string;
  weekStart: string;
  weekEnd: string;
  currentUserId: string;
  access: { agendaRead: boolean; agendaWrite: boolean; pautaRead: boolean; pautaWrite: boolean; editorialLinkAccess: boolean };
  profiles: AgendaProfile[];
  events: AgendaEventItem[];
  pendingInvitations: PendingMeetingInvitation[];
  pautaItems: WeeklyPautaItem[];
}
