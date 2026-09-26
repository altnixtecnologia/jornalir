import type { ArticleExternalSource } from "@ir/types";

/** Dados de uma nova origem externa; id/importedAt/createdAt/updatedAt são atribuídos pelo provider. */
export type NewArticleExternalSourceRecord = Omit<
  ArticleExternalSource,
  "id" | "importedAt" | "createdAt" | "updatedAt"
>;

export type ArticleExternalSourceChanges = Partial<
  Pick<ArticleExternalSource, "lastSyncedAt" | "sourceHash" | "rawMetadata">
>;

/**
 * Contrato da rastreabilidade de conteúdo importado (Fase 33 — preparação
 * da migração do site legado). Ainda sem serviço/UI em volta: usado
 * diretamente pelo futuro importador real, que ainda não existe nesta
 * fase (`packages/core` só define o contrato, `apps/sistema` implementa o
 * provider Supabase — mesma arquitetura das demais entidades).
 */
export interface ArticleExternalSourceRepository {
  getByArticleId(articleId: string): Promise<ArticleExternalSource | null>;
  /** `null` quando nenhuma matéria externa com esse identificador já foi importada — usado para bloquear duplicidade antes de criar. */
  findByProviderAndIdentifier(
    provider: string,
    identifier: { externalId?: string; sourceUrl?: string },
  ): Promise<ArticleExternalSource | null>;
  create(record: NewArticleExternalSourceRecord): Promise<ArticleExternalSource>;
  update(id: string, changes: ArticleExternalSourceChanges): Promise<ArticleExternalSource>;
}
