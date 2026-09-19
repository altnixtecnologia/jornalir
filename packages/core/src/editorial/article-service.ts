import type {
  Article,
  ArticleMedia,
  ArticleOrigin,
  AuditContext,
  EditorialPlacement,
  NotificationMode,
} from "@ir/types";
import type {
  ArticleChanges,
  ArticleFilters,
  ArticleRepository,
  NewArticleRecord,
} from "./article-repository";
import type { EditorialSectionRepository } from "./editorial-section-repository";
import type { LocalityRepository } from "./locality-repository";

export class ArticleNotFoundError extends Error {
  constructor(id: string) {
    super(`Matéria não encontrada: ${id}`);
  }
}

export class EditorialSectionNotFoundError extends Error {
  constructor(id: string) {
    super(`Editoria não encontrada: ${id}`);
  }
}

export class LocalityNotFoundError extends Error {
  constructor(id: string) {
    super(`Localidade não encontrada: ${id}`);
  }
}

export interface CreateArticleInput {
  title: string;
  subtitle?: string;
  body: string;
  sectionId: string;
  localityId: string;
  notificationMode?: NotificationMode;
  media?: ArticleMedia[];
  origin?: ArticleOrigin;
  editionId?: string;
  editionPageNumber?: number;
  createdBy: string;
}

export interface ScheduleArticleInput {
  scheduledAt: string;
  placement?: EditorialPlacement;
  notificationMode?: NotificationMode;
}

/**
 * Regras do núcleo editorial: toda matéria pertence a uma editoria, localidade
 * é independente, publicação é sempre uma ação explícita e conteúdo importado
 * de PDF entra sempre como rascunho (ver Partes C, E e G do Plano Mestre).
 *
 * `audit` é recebido em cada operação para não inviabilizar o registro de
 * auditoria no backend futuro; nesta fase mock nenhum log é gravado.
 */
export class ArticleService {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly sections: EditorialSectionRepository,
    private readonly localities: LocalityRepository,
  ) {}

  list(filters?: ArticleFilters): Promise<Article[]> {
    return this.articles.list(filters);
  }

  async getById(id: string): Promise<Article> {
    const article = await this.articles.getById(id);
    if (!article) {
      throw new ArticleNotFoundError(id);
    }
    return article;
  }

  async saveDraft(input: CreateArticleInput, _audit: AuditContext): Promise<Article> {
    await this.assertSectionExists(input.sectionId);
    await this.assertLocalityExists(input.localityId);

    const record: NewArticleRecord = {
      title: input.title,
      subtitle: input.subtitle,
      body: input.body,
      sectionId: input.sectionId,
      localityId: input.localityId,
      status: "draft",
      placement: { type: "none" },
      notificationMode: input.notificationMode ?? "none",
      media: input.media ?? [],
      origin: input.origin ?? "manual",
      editionId: input.editionId,
      editionPageNumber: input.editionPageNumber,
      createdBy: input.createdBy,
    };

    return this.articles.create(record);
  }

  async updateDraft(
    id: string,
    changes: ArticleChanges,
    _audit: AuditContext,
  ): Promise<Article> {
    if (changes.sectionId) {
      await this.assertSectionExists(changes.sectionId);
    }
    if (changes.localityId) {
      await this.assertLocalityExists(changes.localityId);
    }
    return this.articles.update(id, changes);
  }

  publishNow(id: string, _audit: AuditContext): Promise<Article> {
    return this.articles.update(id, {
      status: "published",
      publishedAt: new Date().toISOString(),
    });
  }

  schedule(
    id: string,
    input: ScheduleArticleInput,
    _audit: AuditContext,
  ): Promise<Article> {
    return this.articles.update(id, {
      status: "scheduled",
      scheduledAt: input.scheduledAt,
      placement: input.placement,
      notificationMode: input.notificationMode,
    });
  }

  archive(id: string, _audit: AuditContext): Promise<Article> {
    return this.articles.update(id, { status: "archived" });
  }

  /** Conteúdo vindo de importação de PDF sempre entra como rascunho. */
  importAsDraft(
    input: Omit<CreateArticleInput, "origin">,
    audit: AuditContext,
  ): Promise<Article> {
    return this.saveDraft({ ...input, origin: "pdfImport" }, audit);
  }

  private async assertSectionExists(sectionId: string): Promise<void> {
    const section = await this.sections.getById(sectionId);
    if (!section) {
      throw new EditorialSectionNotFoundError(sectionId);
    }
  }

  private async assertLocalityExists(localityId: string): Promise<void> {
    const locality = await this.localities.getById(localityId);
    if (!locality) {
      throw new LocalityNotFoundError(localityId);
    }
  }
}
