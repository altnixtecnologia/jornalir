// Domínio editorial do JornalIR — independente de React, IndexedDB ou Supabase.
// Ver docs/PLANO-MESTRE-JORNALIR.md (Partes B, C, D, E, F, G) e docs/ARCHITECTURE.md.

export type UserRole = "admin" | "editorial";

export type ArticleStatus =
  | "draft"
  | "adjusting"
  | "scheduled"
  | "published"
  | "archived";

export type NotificationMode = "none" | "normal" | "urgent";

export type LocalityScope = "city" | "region" | "general";

/** Cidade/região/abrangência geral. Independente da editoria. */
export interface Locality {
  id: string;
  slug: string;
  name: string;
  scope: LocalityScope;
  active: boolean;
}

/** Assunto/editoria. Toda matéria pertence sempre a uma. */
export interface EditorialSection {
  id: string;
  slug: string;
  name: string;
  description?: string;
  active: boolean;
}

export type EditorialPlacementType =
  | "none"
  | "headline"
  | "mainHighlight"
  | "secondaryHighlight"
  | "urgent"
  | "sectionHighlight"
  | "special";

/**
 * Exposição editorial temporária (capa/destaque). Nunca substitui a editoria
 * da matéria — a matéria continua existindo em sua editoria original mesmo
 * quando não está em nenhum destaque.
 */
export interface EditorialPlacement {
  type: EditorialPlacementType;
  startsAt?: string;
  endsAt?: string;
}

export interface MediaAsset {
  id: string;
  /** Referência interna legível, ex.: IR-MAT-2026-001245-IMG-01. */
  reference: string;
  url: string;
  altText?: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export type ArticleMediaRole = "cover" | "gallery";

/** Vínculo entre matéria e mídia. Só uma imagem pode ser capa; as demais formam a galeria, com ordem própria. */
export interface ArticleMedia {
  mediaAssetId: string;
  role: ArticleMediaRole;
  order: number;
}

export type ArticleOrigin = "manual" | "pdfImport";

export type EditorialTextSize = "default" | "large" | "xlarge";
export type EditorialEmphasis = "normal" | "medium" | "strong";

/**
 * Ajustes pontuais permitidos para título/subtítulo (Parte C, item 7 do
 * Plano Mestre). Não é um editor livre: apenas negrito, itálico, tamanho e
 * peso/ênfase entre opções limitadas. Ausente = padrão editorial automático.
 */
export interface EditorialTextStyle {
  bold: boolean;
  italic: boolean;
  size: EditorialTextSize;
  emphasis: EditorialEmphasis;
}

export interface Article {
  id: string;
  /** Referência interna legível, ex.: IR-MAT-2026-001245. */
  reference: string;
  title: string;
  /** Ausente = padrão editorial automático do título. */
  titleStyle?: EditorialTextStyle;
  subtitle?: string;
  /** Ausente = padrão editorial automático do subtítulo. */
  subtitleStyle?: EditorialTextStyle;
  /** HTML gerado pelo editor de texto (negrito, itálico, listas, link, citação, alinhamento). */
  body: string;
  sectionId: string;
  localityId: string;
  status: ArticleStatus;
  placement: EditorialPlacement;
  notificationMode: NotificationMode;
  /** Vazio quando não há imagem. Uma entrada com role "cover" quando houver capa. */
  media: ArticleMedia[];
  origin: ArticleOrigin;
  editionId?: string;
  editionPageNumber?: number;
  publishedAt?: string;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface NewspaperEdition {
  id: string;
  /** Referência interna legível da edição, ex.: ED-2026-038. */
  reference: string;
  title: string;
  publicationDate: string;
  pdfUrl?: string;
  pageCount?: number;
  createdAt: string;
}

// --- Contratos mínimos para futura importação de PDF (sem parser/OCR agora) ---

export type ImportCandidateStatus = "pending" | "discarded" | "converted";

/**
 * Candidato a matéria extraído de uma edição em PDF. Nunca é publicado
 * automaticamente: revisão manual decide manter como rascunho, mesclar,
 * dividir ou descartar (ex.: publicidade interpretada como matéria).
 */
export interface ImportCandidate {
  id: string;
  editionId: string;
  pageNumber?: number;
  suggestedTitle?: string;
  suggestedSubtitle?: string;
  suggestedBody?: string;
  suggestedSectionId?: string;
  suggestedLocalityId?: string;
  suggestedMediaAssetIds?: string[];
  status: ImportCandidateStatus;
  createdArticleId?: string;
  /** Preenchido quando este candidato foi descartado por ter sido mesclado em outro. */
  mergedIntoId?: string;
  createdAt: string;
}

// --- Auditoria (contrato apenas; imutabilidade é responsabilidade do backend futuro) ---

export interface AuditContext {
  actorId: string;
  actorRole: UserRole;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  entity: string;
  entityId: string;
  occurredAt: string;
  before?: unknown;
  after?: unknown;
  context?: string;
}
