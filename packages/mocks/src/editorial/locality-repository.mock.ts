import type { Locality } from "@ir/types";
import type { LocalityChanges, LocalityRepository, NewLocalityRecord } from "@ir/core";
import { localities } from "./data";

/**
 * Provider mock em memória. O estado dura apenas a sessão do módulo que o
 * instanciou; não é persistência real. Cada chamada cria uma cópia isolada
 * dos dados iniciais.
 */
export function createLocalityRepositoryMock(
  initialLocalities: Locality[] = localities,
): LocalityRepository {
  const store: Locality[] = [...initialLocalities];
  let sequence = store.length;

  return {
    async list() {
      return store;
    },
    async getById(id) {
      return store.find((locality) => locality.id === id) ?? null;
    },
    async create(record: NewLocalityRecord) {
      sequence += 1;
      const locality: Locality = { ...record, id: `loc-mock-${sequence}` };
      store.push(locality);
      return locality;
    },
    async update(id, changes: LocalityChanges) {
      const index = store.findIndex((locality) => locality.id === id);
      if (index === -1) {
        throw new Error(`Localidade não encontrada: ${id}`);
      }
      const updated: Locality = { ...store[index], ...changes };
      store[index] = updated;
      return updated;
    },
  };
}
