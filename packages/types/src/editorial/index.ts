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
  /** Ordem de exibição definida pela redação (menor primeiro). Não é o índice do array. */
  order: number;
}

/**
 * Posições editoriais (Fase 22) — os únicos destinos de exposição extra
 * que o painel oferece. Cada um corresponde a um bloco real e já
 * implementado do portal; nunca um nome sem lugar nenhum para aparecer.
 * Os antigos `headline`/`mainHighlight`/`secondaryHighlight`/
 * `sectionHighlight`/`special`/`urgent` (como posição) foram removidos —
 * `urgent` virou o campo independente `Article.urgent` (ver abaixo), e os
 * demais não tinham representação visual própria e foram descontinuados.
 */
export type EditorialPlacementType =
  | "none"
  | "mainCover"
  | "highlightStrip"
  | "latestNews"
  | "localSpotlight";

/** Limite máximo de matérias visíveis simultaneamente em cada posição editorial. */
export const EDITORIAL_PLACEMENT_LIMITS: Record<Exclude<EditorialPlacementType, "none">, number> = {
  mainCover: 8,
  highlightStrip: 3,
  latestNews: 7,
  localSpotlight: 4,
};

/**
 * Exposição editorial temporária (capa/destaque). Nunca substitui a editoria
 * nem a localidade da matéria — a matéria continua existindo em sua editoria
 * (e, quando houver, sua localidade) original mesmo quando não está em
 * nenhuma posição, ou quando sai de uma.
 */
export interface EditorialPlacement {
  type: EditorialPlacementType;
  /**
   * Só tem efeito quando `type === "mainCover"`: impede a rotação
   * automática de expulsar a matéria quando novas entram na posição 1.
   * As demais vagas da Capa principal continuam girando normalmente.
   */
  pinned?: boolean;
  /**
   * Só tem efeito com `pinned=true`: ordem manual entre as fixadas (Fase
   * 29 — "reorganizar manualmente quando fizer sentido"). As não fixadas
   * continuam ordenadas automaticamente por `setAt` (recência) — não fazem
   * sentido reordenar manualmente porque já giram sozinhas.
   */
  pinnedRank?: number;
  startsAt?: string;
  endsAt?: string;
  /**
   * Quando a posição foi definida/alterada pela última vez — base para a
   * ordem determinística de "mais recente primeiro" (nunca a ordem
   * incidental de leitura do banco). Preenchido automaticamente pelo
   * serviço sempre que `type` muda para um valor diferente de "none".
   */
  setAt?: string;
}

export interface MediaAsset {
  id: string;
  /** Referência interna legível, ex.: IR-MAT-2026-001245-IMG-01. */
  reference: string;
  /** Nome curto para localizar a mídia na biblioteca (não é a legenda de publicação). */
  name: string;
  url: string;
  altText?: string;
  /** Legenda padrão, usada quando uma matéria não define uma legenda própria para esta mídia. */
  caption?: string;
  /** Crédito padrão (fotógrafo/fonte), usado quando uma matéria não define um crédito próprio. */
  credit?: string;
  /** Data em que a foto/mídia foi feita — distinta de `createdAt` (data de cadastro no sistema). */
  capturedAt?: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export type ArticleMediaRole = "cover" | "gallery";

/**
 * Vínculo entre matéria e mídia. Só uma imagem pode ser capa; as demais
 * formam a galeria, com ordem própria. `caption`/`credit` sobrescrevem, só
 * para este uso, a legenda/crédito padrão da mídia (`MediaAsset.caption`/
 * `credit`) — ausentes, a exibição cai para o padrão da mídia.
 */
export interface ArticleMedia {
  mediaAssetId: string;
  role: ArticleMediaRole;
  order: number;
  caption?: string;
  credit?: string;
}

/** `legacySite` (Fase 33) — conteúdo importado do site antigo, nunca marcado como `manual`. */
export type ArticleOrigin = "manual" | "pdfImport" | "legacySite";

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
  /**
   * Selo/alerta de urgência — independente da posição editorial e da
   * editoria (Fase 22: antes era um valor de `EditorialPlacementType`,
   * misturando "onde aparece" com "quão urgente é"). Também distinto de
   * `notificationMode`: este é um selo permanente da matéria; o outro é o
   * tom de uma notificação push pontual no momento da publicação/
   * agendamento.
   */
  urgent: boolean;
  notificationMode: NotificationMode;
  /** Vazio quando não há imagem. Uma entrada com role "cover" quando houver capa. */
  media: ArticleMedia[];
  origin: ArticleOrigin;
  /** Autoria/byline opcional (Fase 33) — nunca obrigatória, nunca uma editoria própria. */
  authorName?: string;
  editionId?: string;
  editionPageNumber?: number;
  publishedAt?: string;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * Rastreabilidade de conteúdo importado de uma fonte externa (Fase 33 —
 * preparação para a migração do site antigo). Nunca exposta ao público —
 * é metadado interno de migração, não conteúdo editorial. Uma matéria tem
 * no máximo uma linha por `provider`.
 */
export interface ArticleExternalSource {
  id: string;
  articleId: string;
  /** Ex.: "informativo_regional_legacy". */
  provider: string;
  externalId?: string;
  sourceUrl?: string;
  sourceSlug?: string;
  originalCategory?: string;
  originalSubcategory?: string;
  originalAuthor?: string;
  originalPublishedAt?: string;
  originalUpdatedAt?: string;
  importedAt: string;
  lastSyncedAt?: string;
  sourceHash?: string;
  rawMetadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface NewspaperEdition {
  id: string;
  /** Número da edição — o identificador que a redação usa de verdade (ex.: "Edição 769"). */
  editionNumber: number;
  /** Referência interna legível, derivada do número, ex.: ED-2026-038. */
  reference: string;
  title: string;
  publicationDate: string;
  pdfUrl?: string;
  pageCount?: number;
  /** Inativar é a única forma de remoção pela UI — nunca exclusão destrutiva. */
  active: boolean;
  createdAt: string;
}

// --- Importação de PDF (Parte G do Plano Mestre) ---
// Extração real de texto/layout mora em @ir/pdf-extraction (pacote isolado,
// sem depender deste pacote). Aqui ficam apenas os contratos de domínio.

export type ImportCandidateStatus = "pending" | "discarded" | "converted";

export type ImportExtractionMethod = "textLayer" | "ocr" | "manual";

/** Um bloco de texto de origem (rastreabilidade até página/coluna/posição). */
export interface ImportSourceBlock {
  page: number;
  column: number;
  role: "title" | "subtitle" | "body";
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

/**
 * Métricas de conservação textual da página de origem (não só deste
 * candidato) — quantos blocos a camada de texto tinha, quantos foram
 * aproveitados em algum candidato, e se algo ficou órfão. Um retrato da
 * página inteira no momento da extração; vários candidatos da mesma página
 * compartilham o mesmo retrato.
 */
export interface ImportPageCoverage {
  blocksFound: number;
  blocksUsed: number;
  orphanBlocks: number;
  /** blocksUsed / blocksFound. 1 quando não há blocos. */
  coverageByCount: number;
  /** Caracteres cobertos / caracteres totais dos blocos de origem. 1 quando não há blocos. */
  coverageByChars: number;
}

/**
 * Rastreabilidade e confiança da extração. Nunca esconde incerteza: os
 * avisos e sinalizadores vêm diretamente do pipeline de extração e refletem
 * exatamente o que foi (ou não) possível determinar com segurança.
 */
export interface ImportCandidateExtraction {
  method: ImportExtractionMethod;
  pageWidth: number;
  pageHeight: number;
  /** Blocos de origem, na ordem de leitura determinada pelo layout. */
  blocks: ImportSourceBlock[];
  warnings: string[];
  lowConfidenceTitle: boolean;
  possibleContinuation: boolean;
  possibleAdvertisement: boolean;
  pageCoverage: ImportPageCoverage;
}

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
  /** Ausente para candidatos criados manualmente (fluxos futuros); presente para os extraídos de PDF. */
  extraction?: ImportCandidateExtraction;
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
