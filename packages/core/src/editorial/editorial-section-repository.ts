import type { EditorialSection } from "@ir/types";

/** Dados de uma nova editoria; id, slug (quando não informado) e order são atribuídos pelo provider/serviço. */
export type NewEditorialSectionRecord = Omit<EditorialSection, "id" | "order"> & {
  order?: number;
};

export type EditorialSectionChanges = Partial<Omit<EditorialSection, "id">>;

export interface EditorialSectionRepository {
  list(): Promise<EditorialSection[]>;
  getById(id: string): Promise<EditorialSection | null>;
  create(record: NewEditorialSectionRecord): Promise<EditorialSection>;
  update(id: string, changes: EditorialSectionChanges): Promise<EditorialSection>;
}
