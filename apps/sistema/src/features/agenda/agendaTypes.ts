export type CoverageAttendance = "pending" | "present" | "not_required" | "unable";

export interface CoverageTask {
  id:string;
  kind:import("./coverageTaskCatalog").CoverageTaskKind;
  label:string;
  completedAt:string|null;
  completedBy:string|null;
}

export interface CoverageTeamMember {
  profileId: string;
  fieldTask: string | null;
  fieldCompletedAt: string | null;
  tasks: CoverageTask[];
  attendanceResponse: CoverageAttendance;
  attendanceRespondedAt: string | null;
}

export interface CoverageTeamTransfer {
  id: string;
  fromProfileId: string;
  toProfileId: string;
  part: "field" | "article" | "both";
  reason: string;
  requestedBy: string;
}

export interface EventCoverage {
  eventId: string;
  teamMode: boolean;
  members: CoverageTeamMember[];
  pendingTeamTransfers: CoverageTeamTransfer[];
  attendanceOwnerId: string;
  articleOwnerId: string;
  attendanceStatus: "pending" | "on_way" | "present" | "absent";
  attendanceAt: string | null;
  articleStatus: "pending" | "completed";
  taskLabel: string;
  taskStatus: "pending" | "completed";
  taskCompletedAt: string | null;
  articleCompletedAt: string | null;
  articleDueAt: string | null;
  audibleMinutes: number;
  checkinMinutes: number;
  revision: number;
  pendingTransfer: {
    id: string;
    part: "attendance" | "article" | "both";
    toProfileId: string;
    requestedBy: string;
    reason: string;
  } | null;
}

export interface AgendaProfile {
  id: string;
  name: string;
  role: string;
}

export type EditorialWorkflowKind="general"|"event"|"council"|"visit"|"article";
export type EditorialAttendanceResponse="pending"|"present"|"absent"|"not_required"|"unconfirmed";

export interface AgendaWorkflowAssignee extends AgendaProfile {
  completedAt:string|null;
  taskLabel:string|null;
  workflowTasks:import("./coverageTaskCatalog").CoverageTaskDraft[];
  attendanceResponse:EditorialAttendanceResponse;
  attendanceRespondedAt:string|null;
  attendanceMarkedBy:string|null;
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
  workflowKind:EditorialWorkflowKind;
  councilCity:string|null;
  articleOwnerId:string|null;
  articleDueAt:string|null;
  articleDueTimeExplicit:boolean;
  articleCompletedAt:string|null;
  articleCompletedBy:string|null;
  workflowClosedAt:string|null;
  workflowClosedBy:string|null;
  showInAgenda: boolean;
  appointmentPautaId: string | null;
  appointmentOwnerId: string | null;
  coverage: EventCoverage | null;
  completedAt: string | null;
  updatedAt: string;
  location: string | null;
  status: "scheduled" | "completed" | "cancelled";
  assignees: AgendaWorkflowAssignee[];
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
  coverage: EventCoverage | null;
  workflow:AgendaEventItem|null;
  articleId: string | null;
  appointments: {profileId:string;personName:string;eventId:string;eventDate:string;startTime:string|null}[];
  status: "pending" | "completed" | "cancelled";
  completedAt: string | null;
  assignees: (AgendaProfile & { completedAt: string | null; taskLabel: string | null })[];
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
  periodStart: string;
  periodEnd: string;
  periodReason: string | null;
  periodEdited: boolean;
  editionNumber: number;
  editionEdited: boolean;
  currentUserId: string;
  access: { agendaRead: boolean; agendaWrite: boolean; pautaRead: boolean; pautaWrite: boolean; editorialLinkAccess: boolean; coverageManage: boolean; workflowManage: boolean };
  profiles: AgendaProfile[];
  events: AgendaEventItem[];
  pendingInvitations: PendingMeetingInvitation[];
  pautaItems: WeeklyPautaItem[];
}
