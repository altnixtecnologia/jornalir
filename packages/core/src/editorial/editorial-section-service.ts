import type { EditorialSection } from "@ir/types";
import type { EditorialSectionRepository } from "./editorial-section-repository";

export class EditorialSectionService {
  constructor(private readonly sections: EditorialSectionRepository) {}

  list(): Promise<EditorialSection[]> {
    return this.sections.list();
  }

  getById(id: string): Promise<EditorialSection | null> {
    return this.sections.getById(id);
  }
}
