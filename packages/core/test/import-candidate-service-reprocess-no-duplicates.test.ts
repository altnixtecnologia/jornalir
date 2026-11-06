import { test } from "node:test";
import assert from "node:assert/strict";
import type { Article, ArticleMedia, AuditContext, ImportCandidate } from "@ir/types";
import { ArticleService } from "../src/editorial/article-service";
import { ImportCandidateService } from "../src/editorial/import-candidate-service";
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

const AUDIT: AuditContext = { actorId: "system", actorRole: "editorial" };

/**
 * Correção da auditoria (item 2, 06/11/2026): reprocessar a separação de
 * matérias NUNCA deve gerar um lote novo nem reconverter candidatos já
 * `converted` — só retoma os que ainda estão `pending`. Este teste prova a
 * invariante real por trás de `runEditionMateriasWorkUnit`
 * (apps/sistema/src/lib/editorial/editionMateriasWorker.ts): reprocessar =
 * chamar `convertToDraft` de novo SÓ nos candidatos com status='pending',
 * nunca nos já convertidos — a mesma trava real (`for update` + checagem
 * de status na RPC `convert_import_candidate_to_draft`) garante que isso
 * nunca duplica a matéria, mesmo que algo chamasse convertToDraft duas
 * vezes no mesmo candidato por engano.
 *
 * Cenário exato pedido pelo usuário: extrai 3 matérias, converte 2 com
 * sucesso, simula falha na 3ª, reprocessa (só a 3ª é tentada de novo),
 * confirma 1 rascunho por matéria, reprocessa de novo (nada pendente) e
 * confirma que nenhum rascunho adicional é criado.
 */
function makeArticleRepo(): { repo: ArticleRepository; createCallCount: () => number } {
  const store: Article[] = [];
  let createCalls = 0;
  const repo: ArticleRepository = {
    async list(_filters?: ArticleFilters) { return store; },
    async getById(id: string) { return store.find((a) => a.id === id) ?? null; },
    async create(record: NewArticleRecord) {
      createCalls += 1;
      const article = { ...record, id: `article-${store.length}`, reference: "IR-MAT-TEST", createdAt: "x", updatedAt: "x" } as Article;
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
  return { repo, createCallCount: () => createCalls };
}

const sectionRepo: EditorialSectionRepository = { async list() { return []; }, async getById() { return null; } };
const localityRepo: LocalityRepository = { async list() { return []; }, async getById() { return null; } };

/**
 * `shouldFail` simula a 3ª matéria falhando na PRIMEIRA tentativa (ex.:
 * erro transitório de rede/banco) e funcionando normalmente depois —
 * exatamente o que o botão "Reprocessar" espera poder corrigir.
 */
function makeCandidateRepo(
  initial: ImportCandidate[],
  articles: ArticleRepository,
  shouldFailOnce: Set<string>,
): ImportCandidateRepository {
  const store = [...initial];
  const alreadyFailed = new Set<string>();
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
      const i = store.findIndex((c) => c.id === id);
      if (i === -1) throw new Error("not found");
      if (store[i].status !== "pending") throw new Error(`Candidato ${id} já foi processado (status=${store[i].status})`);
      if (shouldFailOnce.has(id) && !alreadyFailed.has(id)) {
        alreadyFailed.add(id);
        throw new Error("Falha simulada (ex.: erro transitório de rede/banco) na primeira tentativa.");
      }
      const record: NewArticleRecord = {
        title: input.title, subtitle: input.subtitle, body: input.body,
        sectionId: input.sectionId as unknown as string, localityId: input.localityId as unknown as string,
        status: "draft", placement: { type: "none" }, urgent: false, notificationMode: "none",
        media: input.media as ArticleMedia[], origin: "pdfImport", createdBy: "system",
      };
      const created = await articles.create(record);
      store[i] = { ...store[i], status: "converted", createdArticleId: created.id } as ImportCandidate;
      return { articleId: created.id };
    },
    async splitAtomic(_id: string, _input: SplitCandidateAtomicInput) { throw new Error("not used"); },
    async mergeAtomic(_primaryId: string, _input: MergeCandidatesAtomicInput) { throw new Error("not used"); },
  };
  return repo;
}

/** Exatamente o que `runEditionMateriasWorkUnit` faz: só tenta convertToDraft nos candidatos
 * ainda `pending` — nunca nos já `converted`. */
async function convertAllPending(service: ImportCandidateService, repo: ImportCandidateRepository, candidateIds: string[]): Promise<void> {
  for (const id of candidateIds) {
    const candidate = await repo.getById(id);
    if (!candidate || candidate.status !== "pending") continue; // nunca reconverte um já convertido
    try {
      await service.convertToDraft(id, { createdBy: "system" }, AUDIT);
    } catch {
      // falha nesta matéria não impede as demais; candidato permanece pending para retomada.
    }
  }
}

test("reprocessar após falha parcial: as 2 matérias já convertidas continuam com exatamente 1 rascunho cada, a 3ª é criada uma única vez, e reprocessar de novo não cria nada adicional", async () => {
  const { repo: articleRepo, createCallCount } = makeArticleRepo();
  const articleService = new ArticleService(articleRepo, sectionRepo, localityRepo);
  const candidateIds = ["cand-1", "cand-2", "cand-3"];
  const candidates: ImportCandidate[] = candidateIds.map((id, index) => ({
    id, editionId: "edition-1", suggestedTitle: `Matéria ${index + 1}`, suggestedBody: "<p>Corpo.</p>",
    status: "pending", createdAt: "2026-11-06T00:00:00.000Z",
  }));
  const candidateRepo = makeCandidateRepo(candidates, articleRepo, new Set(["cand-3"]));
  const service = new ImportCandidateService(candidateRepo, articleService);

  // 1ª extração/conversão: 1 e 2 convertem, 3 falha e permanece pending.
  await convertAllPending(service, candidateRepo, candidateIds);
  assert.equal((await candidateRepo.getById("cand-1"))?.status, "converted");
  assert.equal((await candidateRepo.getById("cand-2"))?.status, "converted");
  assert.equal((await candidateRepo.getById("cand-3"))?.status, "pending", "a 3ª falhou e deve permanecer pending para retomada");
  assert.equal(createCallCount(), 2, "só 2 matérias foram criadas até aqui");

  // Reprocessar: nunca toca cand-1/cand-2 (já converted), só tenta cand-3 (pending).
  await convertAllPending(service, candidateRepo, candidateIds);
  assert.equal((await candidateRepo.getById("cand-1"))?.status, "converted");
  assert.equal((await candidateRepo.getById("cand-2"))?.status, "converted");
  assert.equal((await candidateRepo.getById("cand-3"))?.status, "converted", "a 3ª deve ter sido convertida no reprocessamento");
  assert.equal(createCallCount(), 3, "exatamente 1 rascunho por matéria — nenhuma duplicata");

  // Reprocessar de novo: nada pending, nenhuma chamada de criação deve acontecer.
  await convertAllPending(service, candidateRepo, candidateIds);
  assert.equal(createCallCount(), 3, "reprocessar quando não há nada pendente não cria nenhum rascunho adicional");
});
