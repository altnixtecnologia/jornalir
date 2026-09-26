import type { NewspaperEdition } from "@ir/types";
import type { NewspaperEditionChanges, NewspaperEditionRepository, NewNewspaperEditionRecord } from "@ir/core";
import { newspaperEditions } from "./data";

export function createNewspaperEditionRepositoryMock(
  initialEditions: NewspaperEdition[] = newspaperEditions,
): NewspaperEditionRepository {
  const store: NewspaperEdition[] = [...initialEditions];
  let sequence = store.length;

  return {
    async list() {
      return store;
    },
    async getById(id) {
      return store.find((edition) => edition.id === id) ?? null;
    },
    async create(record: NewNewspaperEditionRecord) {
      sequence += 1;
      const year = record.publicationDate.slice(0, 4);
      const edition: NewspaperEdition = {
        ...record,
        id: `edition-mock-${sequence}`,
        reference: `ED-${year}-${String(record.editionNumber).padStart(3, "0")}`,
        createdAt: new Date().toISOString(),
      };
      store.push(edition);
      return edition;
    },
    async update(id, changes: NewspaperEditionChanges) {
      const index = store.findIndex((edition) => edition.id === id);
      if (index === -1) {
        throw new Error(`Edição não encontrada: ${id}`);
      }
      const updated: NewspaperEdition = { ...store[index], ...changes };
      if (changes.editionNumber !== undefined || changes.publicationDate !== undefined) {
        const year = updated.publicationDate.slice(0, 4);
        updated.reference = `ED-${year}-${String(updated.editionNumber).padStart(3, "0")}`;
      }
      store[index] = updated;
      return updated;
    },
  };
}
