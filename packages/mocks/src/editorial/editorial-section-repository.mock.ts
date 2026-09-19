import type { EditorialSection } from "@ir/types";
import type { EditorialSectionRepository } from "@ir/core";
import { editorialSections } from "./data";

export function createEditorialSectionRepositoryMock(
  sections: EditorialSection[] = editorialSections,
): EditorialSectionRepository {
  return {
    async list() {
      return sections;
    },
    async getById(id) {
      return sections.find((section) => section.id === id) ?? null;
    },
  };
}
