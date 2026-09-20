import type { NewspaperEdition } from "@ir/types";

export interface NewspaperEditionRepository {
  list(): Promise<NewspaperEdition[]>;
  getById(id: string): Promise<NewspaperEdition | null>;
}
