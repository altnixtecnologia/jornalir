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

export interface AuditEventRow {
  id: string;
  userId: string | null;
  responsibleName: string | null;
  entityType: string;
  entityId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type AuditEventSortField = "created_at" | "entity_type" | "action";
export type AuditEventOrigin = "user" | "automatic";
export type AuditEventResult = "success" | "failed" | "skipped";

export interface AuditEventPageQuery {
  page?: number;
  pageSize?: number;
  /** Busca livre: ação, entidade, id da entidade e conteúdo do metadata. */
  search?: string;
  entityType?: string;
  action?: string;
  userId?: string;
  origin?: AuditEventOrigin;
  result?: AuditEventResult;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: AuditEventSortField;
  sortDir?: "asc" | "desc";
}

export interface AuditEventPageResult {
  items: AuditEventRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function clampPageSize(value: number | undefined): number {
  const parsed = Math.floor(value ?? 25);
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(100, parsed);
}

/**
 * Página do log de auditoria para a tela /sistema/configuracoes/auditoria.
 * RLS de audit_events já restringe a leitura a owner/admin — esta função
 * não adiciona nenhuma checagem extra de permissão (isso é feito no
 * page.tsx, mesmo padrão das outras telas de configurações).
 */
export async function listAuditEventsAdminPageSupabase(
  client: SupabaseClient,
  input: AuditEventPageQuery = {},
): Promise<AuditEventPageResult> {
  const pageSize = clampPageSize(input.pageSize);
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const sortBy: AuditEventSortField = input.sortBy ?? "created_at";
  const sortDir = input.sortDir === "asc" ? "asc" : "desc";

  let builder = client
    .from("audit_events")
    .select("id,user_id,entity_type,entity_id,action,metadata,created_at,profiles(name)", { count: "exact" });

  if (input.entityType) builder = builder.eq("entity_type", input.entityType);
  if (input.action) builder = builder.eq("action", input.action);
  if (input.userId) builder = builder.eq("user_id", input.userId);
  if (input.dateFrom) builder = builder.gte("created_at", input.dateFrom);
  if (input.dateTo) builder = builder.lte("created_at", input.dateTo);
  // "Automático" = sem usuário responsável (sistema/agendador/JoIR); a
  // distinção fina entre os três aparece no detalhe de cada evento
  // (metadata.origin), não como um segundo filtro — evita depender de
  // comparação NOT/OR em coluna jsonb ausente (metadata->>origin pode não
  // existir em boa parte dos eventos já gravados antes deste lote).
  if (input.origin === "user") builder = builder.not("user_id", "is", null);
  if (input.origin === "automatic") builder = builder.is("user_id", null);
  if (input.result === "failed") builder = builder.filter("metadata->>result", "eq", "failed");
  if (input.result === "skipped") builder = builder.filter("metadata->>result", "eq", "skipped");
  // "Sucesso" inclui tanto metadata.result='success' explícito quanto a
  // ausência da chave (todo evento gravado antes deste lote nunca falhava
  // ao chegar na chamada de auditoria — só era chamada após o sucesso).
  if (input.result === "success") {
    builder = builder.or("metadata->>result.is.null,metadata->>result.eq.success");
  }

  const term = (input.search ?? "").trim();
  if (term) {
    const safe = term.replace(/[%,]/g, " ").trim();
    if (safe) {
      // PostgREST não aceita cast (metadata::text) dentro de uma árvore
      // or() — confirmado via teste real (PGRST100). Busca por título é o
      // caminho prático mais comum, sem precisar varrer o jsonb inteiro.
      builder = builder.or(
        [
          `action.ilike.%${safe}%`,
          `entity_type.ilike.%${safe}%`,
          `metadata->>title.ilike.%${safe}%`,
        ].join(","),
      );
    }
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await builder
    .order(sortBy, { ascending: sortDir === "asc" })
    .order("id", { ascending: sortDir === "asc" })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);

  const items: AuditEventRow[] = (data ?? []).map((row) => {
    const profile = row.profiles as { name?: string } | { name?: string }[] | null;
    const responsibleName = Array.isArray(profile) ? profile[0]?.name ?? null : profile?.name ?? null;
    return {
      id: row.id as string,
      userId: (row.user_id as string | null) ?? null,
      responsibleName,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      action: row.action as string,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.created_at as string,
    };
  });

  const total = count ?? 0;
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
