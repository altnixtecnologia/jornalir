import type { ImportCandidate } from "@ir/types";
import type {
  ImportCandidateChanges,
  ImportCandidateFilters,
  ImportCandidateRepository,
  NewImportCandidateRecord,
} from "@ir/core";

function matchesFilters(candidate: ImportCandidate, filters?: ImportCandidateFilters): boolean {
  if (!filters) return true;
  if (filters.editionId && candidate.editionId !== filters.editionId) return false;
  if (filters.status && candidate.status !== filters.status) return false;
  return true;
}

/**
 * Provider mock em memória. Começa vazio de propósito: o fluxo de importação
 * (Fase 08) parte de "nenhum candidato ainda" até o usuário simular a seleção
 * de um PDF e gerar um lote.
 */
export function createImportCandidateRepositoryMock(
  initial: ImportCandidate[] = [],
): ImportCandidateRepository {
  const store: ImportCandidate[] = [...initial];
  let sequence = store.length;

  function createOne(record: NewImportCandidateRecord): ImportCandidate {
    sequence += 1;
    const candidate: ImportCandidate = {
      ...record,
      id: `candidate-mock-${sequence}`,
      createdAt: new Date().toISOString(),
    };
    store.push(candidate);
    return candidate;
  }

  return {
    async list(filters) {
      return store.filter((candidate) => matchesFilters(candidate, filters));
    },

    async getById(id) {
      return store.find((candidate) => candidate.id === id) ?? null;
    },

    async create(record) {
      return createOne(record);
    },

    async createMany(records) {
      return records.map((record) => createOne(record));
    },

    async update(id, changes: ImportCandidateChanges) {
      const index = store.findIndex((candidate) => candidate.id === id);
      if (index === -1) {
        throw new Error(`Candidato de importação não encontrado: ${id}`);
      }
      const updated: ImportCandidate = { ...store[index], ...changes };
      store[index] = updated;
      return updated;
    },

    // Mock em memória, single-threaded — "atômico" por construção (nada
    // concorrente aqui). Só replica as mesmas regras de negócio da RPC real
    // (status pendente, mesma edição) pra não divergir do provider real.
    async findBatchByHash() {
      return null;
    },

    async convertToDraftAtomic(id) {
      const index = store.findIndex((candidate) => candidate.id === id);
      if (index === -1) throw new Error(`Candidato de importação não encontrado: ${id}`);
      if (store[index].status !== "pending") {
        throw new Error(`Candidato ${id} já foi processado (status=${store[index].status})`);
      }
      sequence += 1;
      const articleId = `article-mock-${sequence}`;
      store[index] = { ...store[index], status: "converted", createdArticleId: articleId };
      return { articleId };
    },

    async splitAtomic(id, input) {
      const index = store.findIndex((candidate) => candidate.id === id);
      if (index === -1) throw new Error(`Candidato de importação não encontrado: ${id}`);
      if (store[index].status !== "pending") {
        throw new Error(`Candidato ${id} não pode ser dividido (status=${store[index].status})`);
      }
      store[index] = { ...store[index], suggestedBody: input.firstBody };
      const second = createOne({
        editionId: store[index].editionId,
        pageNumber: store[index].pageNumber,
        suggestedTitle: input.secondTitle,
        suggestedSubtitle: undefined,
        suggestedBody: input.secondBody,
        suggestedSectionId: store[index].suggestedSectionId,
        suggestedLocalityId: store[index].suggestedLocalityId,
        suggestedMediaAssetIds: [],
        status: "pending",
      });
      return { firstId: id, secondId: second.id };
    },

    async mergeAtomic(primaryId, input) {
      const primaryIndex = store.findIndex((candidate) => candidate.id === primaryId);
      if (primaryIndex === -1) throw new Error(`Candidato principal não encontrado: ${primaryId}`);
      if (store[primaryIndex].status !== "pending") {
        throw new Error(`Candidato principal ${primaryId} não está pendente (status=${store[primaryIndex].status})`);
      }
      for (const secondaryId of input.secondaryIds) {
        const index = store.findIndex((candidate) => candidate.id === secondaryId);
        if (index === -1) throw new Error(`Candidato secundário não encontrado: ${secondaryId}`);
        if (store[index].status !== "pending") {
          throw new Error(`Candidato secundário ${secondaryId} não está pendente (status=${store[index].status})`);
        }
        if (store[index].editionId !== store[primaryIndex].editionId) {
          throw new Error(`Candidato secundário ${secondaryId} pertence a outra edição — mesclagem bloqueada`);
        }
        store[index] = { ...store[index], status: "discarded", mergedIntoId: primaryId };
      }
      store[primaryIndex] = {
        ...store[primaryIndex],
        suggestedBody: input.mergedBody,
        suggestedMediaAssetIds: input.mergedMediaAssetIds,
      };
    },
  };
}
