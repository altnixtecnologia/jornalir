import type {
  Article,
  ArticleOrigin,
  ArticleStatus,
  EditorialPlacementType,
  ImportCandidateStatus,
  LocalityScope,
  NewspaperEdition,
  NotificationMode,
} from "@ir/types";

export const articleStatusLabels: Record<ArticleStatus, string> = {
  draft: "Rascunho",
  adjusting: "Em ajuste",
  scheduled: "Programada",
  published: "Publicada",
  archived: "Arquivada",
};

/** Fase 22 — só os destinos com um bloco real e já implementado no portal. */
export const placementLabels: Record<EditorialPlacementType, string> = {
  none: "Nenhuma",
  mainCover: "Capa principal",
  highlightStrip: "Faixa de destaques",
  latestNews: "Últimas notícias",
  localSpotlight: "Nossa região",
};

export const placementDescriptions: Record<EditorialPlacementType, string> = {
  none: "Aparece só no fluxo normal: editoria, localidade e listagens.",
  mainCover: "Grande destaque da home. Até 8 matérias; a mais recente entra na posição 1.",
  highlightStrip: "Faixa horizontal logo abaixo da capa. Até 3 matérias.",
  latestNews: "Bloco interativo de últimas notícias. Até 7 matérias.",
  localSpotlight: "Faixa \"Nossa região\". Até 4 matérias — não substitui a localidade da matéria.",
};

export const notificationLabels: Record<NotificationMode, string> = {
  none: "Sem notificação",
  normal: "Notificação normal",
  urgent: "Notificação urgente",
};

export const importCandidateStatusLabels: Record<ImportCandidateStatus, string> = {
  pending: "Pendente",
  discarded: "Descartado",
  converted: "Convertido",
};

export const localityScopeLabels: Record<LocalityScope, string> = {
  city: "Cidade",
  region: "Região",
  general: "Geral",
};

export const articleOriginLabels: Record<ArticleOrigin, string> = {
  manual: "Manual",
  pdfImport: "Importado do PDF",
};

/** "Edição 037 · Página 6" (ou variação sem página) — só quando a matéria tem edição vinculada. */
export function editionPageLabel(
  editionTitle: string | undefined,
  pageNumber: number | undefined,
): string | null {
  if (!editionTitle) return null;
  return pageNumber ? `${editionTitle} · Página ${pageNumber}` : editionTitle;
}

/** "Edição 769 — 17/09/2026" — identificação clara pedida pela redação (Fase 28). */
export function editionLabel(edition: Pick<NewspaperEdition, "editionNumber" | "publicationDate">): string {
  return `Edição ${edition.editionNumber} — ${formatDate(edition.publicationDate)}`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Data de referência da publicação: publicada usa publishedAt, programada usa scheduledAt. */
export function publicationDate(article: Article): string {
  if (article.status === "published") return formatDate(article.publishedAt);
  if (article.status === "scheduled") return formatDate(article.scheduledAt);
  return "—";
}

export function hasCoverImage(article: Article): boolean {
  return article.media.some((item) => item.role === "cover");
}

export function photoCount(article: Article): number {
  return article.media.length;
}

export function mediaSummary(article: Article): string {
  if (article.media.length === 0) return "Sem imagem";
  const galleryCount = article.media.filter((item) => item.role === "gallery").length;
  if (galleryCount > 0) {
    return hasCoverImage(article) ? `Capa + galeria (${galleryCount})` : `Galeria (${galleryCount})`;
  }
  return hasCoverImage(article) ? "Com capa" : `${article.media.length} imagem(ns)`;
}
