import type {
  Article,
  ArticleStatus,
  EditorialPlacementType,
  ImportCandidateStatus,
  NotificationMode,
} from "@ir/types";

export const articleStatusLabels: Record<ArticleStatus, string> = {
  draft: "Rascunho",
  adjusting: "Em ajuste",
  scheduled: "Programada",
  published: "Publicada",
  archived: "Arquivada",
};

export const placementLabels: Record<EditorialPlacementType, string> = {
  none: "—",
  headline: "Manchete",
  mainHighlight: "Destaque principal",
  secondaryHighlight: "Destaque secundário",
  urgent: "Urgente",
  sectionHighlight: "Destaque da editoria",
  special: "Especial",
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

export function mediaSummary(article: Article): string {
  if (article.media.length === 0) return "Sem imagem";
  const galleryCount = article.media.filter((item) => item.role === "gallery").length;
  if (galleryCount > 0) {
    return hasCoverImage(article) ? `Capa + galeria (${galleryCount})` : `Galeria (${galleryCount})`;
  }
  return hasCoverImage(article) ? "Com capa" : `${article.media.length} imagem(ns)`;
}
