import { test } from "node:test";
import assert from "node:assert/strict";
import type { Article, AuditContext } from "@ir/types";

const AUDIT: AuditContext = { actorId: "u1", actorRole: "owner" };
import { ArticleService } from "../src/editorial/article-service";
import type {
  ArticleChanges, ArticleFilters, ArticleRepository, NewArticleRecord,
} from "../src/editorial/article-repository";
import type { EditorialSectionRepository } from "../src/editorial/editorial-section-repository";
import type { LocalityRepository } from "../src/editorial/locality-repository";

/**
 * Fakes mínimos em memória — sem dependência de @ir/mocks (que depende de
 * @ir/core, então não pode ser importado de volta aqui).
 */
function makeArticleRepo(initial: Article[]): ArticleRepository {
  const store = [...initial];
  return {
    async list(filters?: ArticleFilters) { return filters ? store : store; },
    async getById(id: string) { return store.find((a) => a.id === id) ?? null; },
    async create(record: NewArticleRecord) {
      const article = { ...record, id: `new-${store.length}`, reference: "IR-MAT-TEST", createdAt: "x", updatedAt: "x" } as Article;
      store.push(article);
      return article;
    },
    async update(id: string, changes: ArticleChanges) {
      const i = store.findIndex((a) => a.id === id);
      if (i === -1) throw new Error("not found");
      store[i] = { ...store[i], ...changes, updatedAt: new Date().toISOString() } as Article;
      return store[i];
    },
  };
}
const sectionsStub: EditorialSectionRepository = { getById: async () => ({ id: "s", name: "Geral", slug: "geral" }) } as EditorialSectionRepository;
const localitiesStub: LocalityRepository = { getById: async () => ({ id: "l", name: "Geral", slug: "geral" }) } as LocalityRepository;

function baseArticle(overrides: Partial<Article>): Article {
  return {
    id: "a1", reference: "IR-MAT-2026-000001", title: "Título", body: "<p>x</p>",
    sectionId: "s", localityId: "l", status: "draft", placement: { type: "none" },
    urgent: false, notificationMode: "none", media: [], origin: "manual",
    createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z", createdBy: "u1",
    ...overrides,
  } as Article;
}

test("publishNow usa a data ATUAL quando a matéria nunca teve publishedAt (fluxo normal, draft manual/PDF — sem mudança de comportamento)", async () => {
  const repo = makeArticleRepo([baseArticle({ id: "a1", publishedAt: undefined })]);
  const service = new ArticleService(repo, sectionsStub, localitiesStub);
  const before = Date.now();
  const updated = await service.publishNow("a1", AUDIT);
  assert.equal(updated.status, "published");
  assert.ok(updated.publishedAt);
  assert.ok(new Date(updated.publishedAt!).getTime() >= before - 1000, "sem data prévia, deve usar agora");
});

test("publishNow PRESERVA publishedAt quando a matéria já chegou com a data original (sync incremental do site legado, Lote 2 18/10/2026)", async () => {
  const originalDate = "2026-10-12T10:30:00Z";
  const repo = makeArticleRepo([baseArticle({ id: "a1", status: "draft", publishedAt: originalDate, origin: "legacySite" })]);
  const service = new ArticleService(repo, sectionsStub, localitiesStub);
  const updated = await service.publishNow("a1", AUDIT);
  assert.equal(updated.status, "published");
  assert.equal(updated.publishedAt, originalDate, "publicar um rascunho do legado NÃO pode trocar a data original por 'agora'");
});
