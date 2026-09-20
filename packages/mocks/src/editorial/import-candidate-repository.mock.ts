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
  };
}
