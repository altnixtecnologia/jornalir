import type { EditorialSection } from "@ir/types";

export interface EditorialSectionRepository {
  list(): Promise<EditorialSection[]>;
  getById(id: string): Promise<EditorialSection | null>;
}
