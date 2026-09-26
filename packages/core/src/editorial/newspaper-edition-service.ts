import type { NewspaperEdition } from "@ir/types";
import type {
  NewspaperEditionChanges,
  NewspaperEditionRepository,
  NewNewspaperEditionRecord,
} from "./newspaper-edition-repository";

export class NewspaperEditionNotFoundError extends Error {
  constructor(id: string) {
    super(`Edição não encontrada: ${id}`);
  }
}

export class DuplicateEditionNumberError extends Error {
  constructor(editionNumber: number) {
    super(`Já existe uma edição com o número ${editionNumber}.`);
  }
}

export interface CreateNewspaperEditionInput {
  editionNumber: number;
  title?: string;
  publicationDate: string;
  pdfUrl?: string;
  pageCount?: number;
}

export interface UpdateNewspaperEditionInput {
  editionNumber?: number;
  title?: string;
  publicationDate?: string;
  pdfUrl?: string;
  pageCount?: number;
}

/**
 * Edições do jornal impresso (Parte G/H do Plano Mestre). Cadastro/edição
 * fazem parte do fluxo real (Fase 28) — inativar (`active=false`) é a única
 * forma de remoção pela UI, nunca exclusão destrutiva (uma edição já usada
 * por matérias/candidatos de importação nunca pode sumir de baixo delas).
 */
export class NewspaperEditionService {
  constructor(private readonly editions: NewspaperEditionRepository) {}

  list(): Promise<NewspaperEdition[]> {
    return this.editions.list();
  }

  async listActive(): Promise<NewspaperEdition[]> {
    const all = await this.editions.list();
    return all.filter((edition) => edition.active);
  }

  getById(id: string): Promise<NewspaperEdition | null> {
    return this.editions.getById(id);
  }

  async create(input: CreateNewspaperEditionInput): Promise<NewspaperEdition> {
    await this.assertNumberAvailable(input.editionNumber);
    const record: NewNewspaperEditionRecord = {
      editionNumber: input.editionNumber,
      title: input.title?.trim() || `Edição ${input.editionNumber}`,
      publicationDate: input.publicationDate,
      pdfUrl: input.pdfUrl,
      pageCount: input.pageCount,
      active: true,
    };
    return this.editions.create(record);
  }

  async update(id: string, input: UpdateNewspaperEditionInput): Promise<NewspaperEdition> {
    await this.assertExists(id);
    if (input.editionNumber !== undefined) {
      await this.assertNumberAvailable(input.editionNumber, id);
    }
    const changes: NewspaperEditionChanges = {};
    if (input.editionNumber !== undefined) changes.editionNumber = input.editionNumber;
    if (input.title !== undefined) changes.title = input.title.trim() || undefined;
    if (input.publicationDate !== undefined) changes.publicationDate = input.publicationDate;
    if (input.pdfUrl !== undefined) changes.pdfUrl = input.pdfUrl || undefined;
    if (input.pageCount !== undefined) changes.pageCount = input.pageCount;
    return this.editions.update(id, changes);
  }

  async setActive(id: string, active: boolean): Promise<NewspaperEdition> {
    await this.assertExists(id);
    return this.editions.update(id, { active });
  }

  private async assertExists(id: string): Promise<void> {
    const edition = await this.editions.getById(id);
    if (!edition) {
      throw new NewspaperEditionNotFoundError(id);
    }
  }

  private async assertNumberAvailable(editionNumber: number, ignoreId?: string): Promise<void> {
    const all = await this.editions.list();
    const conflict = all.some((edition) => edition.editionNumber === editionNumber && edition.id !== ignoreId);
    if (conflict) {
      throw new DuplicateEditionNumberError(editionNumber);
    }
  }
}
