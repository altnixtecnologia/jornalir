import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEventInput {
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  /** NUNCA segredo, certificado, senha ou chave privada — só dados seguros pra auditoria (ex.: ids, nomes, flags). */
  metadata?: Record<string, unknown>;
}

/**
 * Grava em `public.audit_events` — log imutável já existente no projeto
 * desde a Fase P (nenhum módulo gravava nele até a NFS-e usar); nunca
 * cria uma tabela de log nova. Sem UPDATE/DELETE pra nenhum papel (ver
 * migration original), então esta função só faz INSERT.
 */
export async function recordAuditEventSupabase(client: SupabaseClient, input: AuditEventInput): Promise<void> {
  const { error } = await client.from("audit_events").insert({
    user_id: input.userId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}
