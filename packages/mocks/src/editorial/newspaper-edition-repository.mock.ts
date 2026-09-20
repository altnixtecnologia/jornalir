import type { NewspaperEdition } from "@ir/types";
import type { NewspaperEditionRepository } from "@ir/core";
import { newspaperEditions } from "./data";

export function createNewspaperEditionRepositoryMock(
  items: NewspaperEdition[] = newspaperEditions,
): NewspaperEditionRepository {
  return {
    async list() {
      return items;
    },
    async getById(id) {
      return items.find((edition) => edition.id === id) ?? null;
    },
  };
}
