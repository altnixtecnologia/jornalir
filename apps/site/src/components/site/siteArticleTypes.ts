import type { NewsItem } from "@ir/types";

// Extensão local, só para o portal público — não altera `@ir/types`
// (compartilhado com o `apps/sistema`). Nenhuma integração de dados nova
// nesta fase: apenas campos visuais opcionais para pré-definir o visual de
// matérias sem foto, com uma foto ou com galeria, sem exigir nenhum backend
// novo (continuam vindo do mock/IndexedDB já existentes do site).

export interface ArticleImage {
  url: string;
  caption?: string;
  credit?: string;
}

export interface SiteArticleExtras {
  subtitle?: string;
  /** Cidade/região da matéria — independente da editoria, como no domínio editorial do jornal. */
  locality?: string;
  credit?: string;
  /**
   * Fotos adicionais além da capa (`imageUrl`). Ausente ou vazio = matéria
   * com no máximo uma foto. A capa nunca é duplicada dentro da galeria.
   */
  gallery?: ArticleImage[];
}

export type SiteArticle = NewsItem & SiteArticleExtras;

export function hasPhoto(article: Pick<SiteArticle, "imageUrl">): boolean {
  return Boolean(article.imageUrl && article.imageUrl.trim().length > 0);
}

export function galleryCount(article: Pick<SiteArticle, "gallery">): number {
  return article.gallery?.length ?? 0;
}
