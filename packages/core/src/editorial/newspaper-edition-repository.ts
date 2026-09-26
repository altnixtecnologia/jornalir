import type { NewspaperEdition } from "@ir/types";

/** Dados de uma nova edição; id, reference e createdAt são atribuídos pelo provider. */
export type NewNewspaperEditionRecord = Omit<NewspaperEdition, "id" | "reference" | "createdAt">;

export type NewspaperEditionChanges = Partial<Omit<NewspaperEdition, "id" | "reference" | "createdAt">>;

export interface NewspaperEditionRepository {
  list(): Promise<NewspaperEdition[]>;
  getById(id: string): Promise<NewspaperEdition | null>;
  create(record: NewNewspaperEditionRecord): Promise<NewspaperEdition>;
  update(id: string, changes: NewspaperEditionChanges): Promise<NewspaperEdition>;
}
