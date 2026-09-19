import type { Article } from "@ir/types";
import type {
  ArticleChanges,
  ArticleFilters,
  ArticleRepository,
  NewArticleRecord,
} from "@ir/core";
import { articlesData } from "./data";

function matchesFilters(article: Article, filters?: ArticleFilters): boolean {
  if (!filters) {
    return true;
  }
  if (filters.status && article.status !== filters.status) {
    return false;
  }
  if (filters.sectionId && article.sectionId !== filters.sectionId) {
    return false;
  }
  if (filters.localityId && article.localityId !== filters.localityId) {
    return false;
  }
  if (filters.placementType && article.placement.type !== filters.placementType) {
    return false;
  }
  if (filters.editionId && article.editionId !== filters.editionId) {
    return false;
  }
  return true;
}

/**
 * Provider mock em memória. O estado dura apenas a sessão do módulo que o
 * instanciou; não é persistência real. Cada chamada cria uma cópia isolada
 * dos dados iniciais.
 */
export function createArticleRepositoryMock(
  initialArticles: Article[] = articlesData,
): ArticleRepository {
  const store: Article[] = [...initialArticles];
  let sequence = store.length;

  return {
    async list(filters) {
      return store.filter((article) => matchesFilters(article, filters));
    },

    async getById(id) {
      return store.find((article) => article.id === id) ?? null;
    },

    async create(record: NewArticleRecord) {
      sequence += 1;
      const now = new Date().toISOString();
      const article: Article = {
        ...record,
        id: `article-mock-${sequence}`,
        reference: `IR-MAT-2026-${String(1246 + sequence).padStart(6, "0")}`,
        createdAt: now,
        updatedAt: now,
      };
      store.push(article);
      return article;
    },

    async update(id, changes: ArticleChanges) {
      const index = store.findIndex((article) => article.id === id);
      if (index === -1) {
        throw new Error(`Matéria não encontrada: ${id}`);
      }
      const updated: Article = {
        ...store[index],
        ...changes,
        updatedAt: new Date().toISOString(),
      };
      store[index] = updated;
      return updated;
    },
  };
}
