import type { AuditEventRow } from "../../providers/supabase/auditEvents.supabase";

/**
 * Tradução de entity_type/action para português claro na tela de
 * Auditoria. Mapeamento parcial e crescente — qualquer combinação não
 * listada aqui cai num texto genérico (humanizeKey), nunca falha nem
 * mostra algo técnico. Adicionar aqui conforme novos módulos passarem a
 * gravar em audit_events (18/10/2026).
 */
const MODULE_LABELS: Record<string, string> = {
  articles: "Editorial",
  users: "Usuários",
  mobile_app_releases: "Aplicativo",
  ai_assistant_chat: "JoIR",
  joir_automation_rule: "JoIR",
  nfse_documents: "Fiscal (NFS-e)",
  nfse_configurations: "Fiscal (NFS-e)",
  nfse_service_profiles: "Fiscal (NFS-e)",
  nfse_certificates: "Fiscal (NFS-e)",
  commercial_proposals: "Publicidade",
  commercial_products: "Publicidade",
  commercial_sales: "Publicidade",
  site_interest_requests: "Publicidade",
  billing_settings: "Financeiro",
  site_offer_settings: "Configurações",
};

const ACTION_LABELS: Record<string, string> = {
  create: "criada",
  update: "atualizada",
  publish: "publicada",
  schedule: "agendada",
  archive: "arquivada",
  update_placement: "alteração de destaque",
  reorder_placement: "reordenação de destaque",
  invite: "convite enviado",
  password_reset_requested: "redefinição de senha solicitada",
  notification_dispatched: "aviso automático gerado",
  notification_skipped: "aviso automático ignorado (desligado)",
};

const ENTITY_SUBJECT_LABELS: Record<string, string> = {
  articles: "Matéria",
  users: "Usuário",
  mobile_app_releases: "Versão do aplicativo",
  ai_assistant_chat: "Conversa do JoIR",
  joir_automation_rule: "Regra de automação do JoIR",
};

function humanizeKey(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function moduleLabel(entityType: string): string {
  return MODULE_LABELS[entityType] ?? humanizeKey(entityType);
}

export function describeEvent(row: AuditEventRow): string {
  const title = typeof row.metadata.title === "string" ? row.metadata.title : undefined;
  const subject = ENTITY_SUBJECT_LABELS[row.entityType] ?? humanizeKey(row.entityType);
  const actionLabel = ACTION_LABELS[row.action] ?? humanizeKey(row.action).toLowerCase();
  const statusChange = typeof row.metadata.statusChange === "string" ? row.metadata.statusChange : undefined;

  const base = title ? `${subject} "${title}" — ${actionLabel}` : `${subject} — ${actionLabel}`;
  return statusChange ? `${base} (${statusChange})` : base;
}

export function originLabel(row: AuditEventRow): string {
  if (row.userId) return row.responsibleName ? row.responsibleName : "Usuário";
  const origin = typeof row.metadata.origin === "string" ? row.metadata.origin : "";
  if (origin.startsWith("joir")) return "JoIR";
  if (origin.startsWith("cron:")) return "Agendador (cron)";
  if (origin.startsWith("trigger:")) return "Serviço automático (gatilho do banco)";
  return "Sistema";
}

export function originBucket(row: AuditEventRow): "user" | "automatic" {
  return row.userId ? "user" : "automatic";
}

export function resultLabel(row: AuditEventRow): "Sucesso" | "Falha" | "Ignorado" {
  const result = typeof row.metadata.result === "string" ? row.metadata.result : "success";
  if (result === "failed") return "Falha";
  if (result === "skipped") return "Ignorado";
  return "Sucesso";
}

/** Metadata sem campos técnicos demais para a visualização detalhada —
 * ainda assim nunca contém segredo (a garantia real é não gravar segredo
 * em metadata.ts na origem, não filtrar aqui). */
export function detailMetadataEntries(row: AuditEventRow): Array<[string, string]> {
  const FIELD_LABELS: Record<string, string> = {
    title: "Título",
    statusChange: "Alteração de status",
    scheduledAt: "Agendado para",
    email: "E-mail",
    role: "Papel",
    kind: "Tipo de aviso",
    href: "Link",
    notificationMode: "Modo de notificação",
    reason: "Motivo",
    placementChange: "Alteração de destaque",
    placementType: "Tipo de destaque",
    origin: "Origem técnica",
    result: "Resultado",
  };
  return Object.entries(row.metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => [
      FIELD_LABELS[key] ?? humanizeKey(key),
      Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value),
    ]);
}
