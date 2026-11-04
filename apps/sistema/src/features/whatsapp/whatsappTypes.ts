export type WhatsappCaseStatus = "pending" | "in_progress" | "done";

export interface WhatsappCase {
  id: string;
  contactName: string;
  contactPhone: string | null;
  status: WhatsappCaseStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsappStaffOption {
  id: string;
  name: string;
}

export const WHATSAPP_STATUS_LABELS: Record<WhatsappCaseStatus, string> = {
  pending: "Pendente",
  in_progress: "Em atendimento",
  done: "Concluído",
};
