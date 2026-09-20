import type { NewspaperEdition } from "@ir/types";
import type { NewspaperEditionRepository } from "./newspaper-edition-repository";

/** Somente leitura nesta fase: cadastro de edições não é o foco do Lote atual. */
export class NewspaperEditionService {
  constructor(private readonly editions: NewspaperEditionRepository) {}

  list(): Promise<NewspaperEdition[]> {
    return this.editions.list();
  }

  getById(id: string): Promise<NewspaperEdition | null> {
    return this.editions.getById(id);
  }
}
