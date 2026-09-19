import type { Locality } from "@ir/types";
import type { LocalityRepository } from "@ir/core";
import { localities } from "./data";

export function createLocalityRepositoryMock(
  items: Locality[] = localities,
): LocalityRepository {
  return {
    async list() {
      return items;
    },
    async getById(id) {
      return items.find((locality) => locality.id === id) ?? null;
    },
  };
}
