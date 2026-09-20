import type { EditorialSection } from "@ir/types";
import type { EditorialSectionChanges, EditorialSectionRepository, NewEditorialSectionRecord } from "@ir/core";
import { editorialSections } from "./data";

/**
 * Provider mock em memória. O estado dura apenas a sessão do módulo que o
 * instanciou; não é persistência real. Cada chamada cria uma cópia isolada
 * dos dados iniciais.
 */
export function createEditorialSectionRepositoryMock(
  initialSections: EditorialSection[] = editorialSections,
): EditorialSectionRepository {
  const store: EditorialSection[] = [...initialSections];
  let sequence = store.length;

  return {
    async list() {
      return store;
    },
    async getById(id) {
      return store.find((section) => section.id === id) ?? null;
    },
    async create(record: NewEditorialSectionRecord) {
      sequence += 1;
      const section: EditorialSection = {
        ...record,
        id: `sec-mock-${sequence}`,
        order: record.order ?? store.length,
      };
      store.push(section);
      return section;
    },
    async update(id, changes: EditorialSectionChanges) {
      const index = store.findIndex((section) => section.id === id);
      if (index === -1) {
        throw new Error(`Editoria não encontrada: ${id}`);
      }
      const updated: EditorialSection = { ...store[index], ...changes };
      store[index] = updated;
      return updated;
    },
  };
}
