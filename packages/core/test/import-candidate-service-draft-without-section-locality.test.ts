import { test } from "node:test";
import assert from "node:assert/strict";
import type { Article, ArticleMedia, AuditContext, ImportCandidate } from "@ir/types";
import { ArticleService } from "../src/editorial/article-service";
import { ImportCandidateAlreadyProcessedError, ImportCandidateService } from "../src/editorial/import-candidate-service";
import type {
  ArticleChanges, ArticleFilters, ArticleRepository, NewArticleRecord,
} from "../src/editorial/article-repository";
import type { EditorialSectionRepository } from "../src/editorial/editorial-section-repository";
import type { LocalityRepository } from "../src/editorial/locality-repository";
import type {
  ConvertCandidateAtomicInput,
  ImportCandidateChanges,
  ImportCandidateRepository,
  MergeCandidatesAtomicInput,
  NewImportCandidateRecord,
  SplitCandidateAtomicInput,
} from "../src/editorial/import-candidate-repository";

const AUDIT: AuditContext = { actorId: "u1", actorRole: "editorial" };

/**
 * Fakes mínimos em memória (mesmo padrão de article-service-publish-date.test.ts
 * — sem depender de @ir/mocks, que importa @ir/core de volta).
 */
function makeArticleRepo(initial: Article[] = []): ArticleRepository {
  const store = [...initial];
  return {
    async list(_filters?: ArticleFilters) { return store; },
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

const sectionRepo: EditorialSectionRepository = {
  async list() { return []; },
  async getById() { return null; },
};
const localityRepo: LocalityRepository = {
  async list() { return []; },
  async getById() { return null; },
};

/**
 * Fake do repositório de candidatos — registra exatamente o que
 * `convertToDraftAtomic` recebeu (nunca um valor fictício no lugar de
 * sectionId/localityId ausentes) e cria o artigo real no fake de articles,
 * imitando `convert_import_candidate_to_draft` (RPC real, pós-fluxo
 * unificado 06/11/2026: aceita section_id/locality_id nulos).
 */
function makeCandidateRepo(
  initial: ImportCandidate[],
  articles: ArticleRepository,
): { repo: ImportCandidateRepository; lastConvertInput: () => ConvertCandidateAtomicInput | undefined } {
  const store = [...initial];
  let lastInput: ConvertCandidateAtomicInput | undefined;
  const repo: ImportCandidateRepository = {
    async list() { return store; },
    async getById(id: string) { return store.find((c) => c.id === id) ?? null; },
    async create(record: NewImportCandidateRecord) {
      const candidate = { ...record, id: `cand-${store.length}`, createdAt: "x" } as ImportCandidate;
      store.push(candidate);
      return candidate;
    },
    async createMany(records: NewImportCandidateRecord[]) {
      return Promise.all(records.map((r) => repo.create(r)));
    },
    async update(id: string, changes: ImportCandidateChanges) {
      const i = store.findIndex((c) => c.id === id);
      if (i === -1) throw new Error("not found");
      store[i] = { ...store[i], ...changes } as ImportCandidate;
      return store[i];
    },
    async findBatchByHash() { return null; },
    async convertToDraftAtomic(id: string, input: ConvertCandidateAtomicInput) {
      lastInput = input;
      const i = store.findIndex((c) => c.id === id);
      if (i === -1) throw new Error("not found");
      if (store[i].status !== "pending") throw new Error(`Candidato ${id} já foi processado (status=${store[i].status})`);
      const record: NewArticleRecord = {
        title: input.title,
        subtitle: input.subtitle,
        body: input.body,
        sectionId: input.sectionId as unknown as string,
        localityId: input.localityId as unknown as string,
        status: "draft",
        placement: { type: "none" },
        urgent: false,
        notificationMode: "none",
        media: input.media as ArticleMedia[],
        origin: "pdfImport",
        createdBy: "u1",
      };
      const created = await articles.create(record);
      store[i] = { ...store[i], status: "converted", createdArticleId: created.id } as ImportCandidate;
      return { articleId: created.id };
    },
    async splitAtomic(_id: string, _input: SplitCandidateAtomicInput) {
      throw new Error("not used in this test");
    },
    async mergeAtomic(_primaryId: string, _input: MergeCandidatesAtomicInput) {
      throw new Error("not used in this test");
    },
  };
  return { repo, lastConvertInput: () => lastInput };
}

test("convertToDraft cria o rascunho sem lançar erro quando o candidato não tem editoria/localidade sugeridas, e nunca inventa um valor — grava null de verdade", async () => {
  const articleRepo = makeArticleRepo();
  const articleService = new ArticleService(articleRepo, sectionRepo, localityRepo);
  const pendingCandidate: ImportCandidate = {
    id: "cand-1",
    editionId: "edition-1",
    suggestedTitle: "Matéria sem editoria definida",
    suggestedBody: "<p>Corpo extraído do PDF.</p>",
    status: "pending",
    createdAt: "2026-11-06T00:00:00.000Z",
  };
  const { repo, lastConvertInput } = makeCandidateRepo([pendingCandidate], articleRepo);
  const service = new ImportCandidateService(repo, articleService);

  const article = await service.convertToDraft("cand-1", { createdBy: "u1" }, AUDIT);

  assert.equal(article.status, "draft");
  const input = lastConvertInput();
  assert.ok(input);
  assert.equal(input?.sectionId, null, "nunca deve inventar um sectionId fictício");
  assert.equal(input?.localityId, null, "nunca deve inventar um localityId fictício");

  const candidateAfter = await repo.getById("cand-1");
  assert.equal(candidateAfter?.status, "converted");
  assert.equal(candidateAfter?.createdArticleId, article.id);
});

test("convertToDraft usa a editoria/localidade sugerida pela extração quando houver, sem exigir revisão manual", async () => {
  const articleRepo = makeArticleRepo();
  const articleService = new ArticleService(articleRepo, sectionRepo, localityRepo);
  const pendingCandidate: ImportCandidate = {
    id: "cand-2",
    editionId: "edition-1",
    suggestedTitle: "Matéria com editoria sugerida",
    suggestedBody: "<p>Corpo.</p>",
    suggestedSectionId: "section-1",
    suggestedLocalityId: "locality-1",
    status: "pending",
    createdAt: "2026-11-06T00:00:00.000Z",
  };
  const { repo, lastConvertInput } = makeCandidateRepo([pendingCandidate], articleRepo);
  const service = new ImportCandidateService(repo, articleService);

  await service.convertToDraft("cand-2", { createdBy: "u1" }, AUDIT);
  const input = lastConvertInput();
  assert.equal(input?.sectionId, "section-1");
  assert.equal(input?.localityId, "locality-1");
});

test("convertToDraft continua rejeitando um candidato já convertido — nunca duplica a matéria mesmo sem editoria/localidade", async () => {
  const articleRepo = makeArticleRepo();
  const articleService = new ArticleService(articleRepo, sectionRepo, localityRepo);
  const alreadyConverted: ImportCandidate = {
    id: "cand-3",
    editionId: "edition-1",
    status: "converted",
    createdArticleId: "article-x",
    createdAt: "2026-11-06T00:00:00.000Z",
  };
  const { repo } = makeCandidateRepo([alreadyConverted], articleRepo);
  const service = new ImportCandidateService(repo, articleService);

  await assert.rejects(
    () => service.convertToDraft("cand-3", { createdBy: "u1" }, AUDIT),
    ImportCandidateAlreadyProcessedError,
  );
});
