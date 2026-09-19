import type { Article, ArticleStatus, EditorialPlacementType } from "@ir/types";

export interface ArticleFilters {
  status?: ArticleStatus;
  sectionId?: string;
  localityId?: string;
  placementType?: EditorialPlacementType;
  editionId?: string;
}

/** Dados de uma nova matéria; id, reference e timestamps são atribuídos pelo provider. */
export type NewArticleRecord = Omit<
  Article,
  "id" | "reference" | "createdAt" | "updatedAt"
>;

export type ArticleChanges = Partial<
  Omit<Article, "id" | "reference" | "createdAt" | "updatedAt">
>;

export interface ArticleRepository {
  list(filters?: ArticleFilters): Promise<Article[]>;
  getById(id: string): Promise<Article | null>;
  create(record: NewArticleRecord): Promise<Article>;
  update(id: string, changes: ArticleChanges): Promise<Article>;
}
