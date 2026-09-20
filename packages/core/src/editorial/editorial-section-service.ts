import type { EditorialSection } from "@ir/types";
import type {
  EditorialSectionChanges,
  EditorialSectionRepository,
  NewEditorialSectionRecord,
} from "./editorial-section-repository";
import { EditorialSectionNotFoundError } from "./article-service";

export interface CreateEditorialSectionInput {
  name: string;
  /** Gerada a partir do nome quando ausente. */
  slug?: string;
  description?: string;
  active?: boolean;
}

export interface UpdateEditorialSectionInput {
  name?: string;
  slug?: string;
  description?: string;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class DuplicateSlugError extends Error {
  constructor(slug: string) {
    super(`Já existe uma editoria com o identificador "${slug}".`);
  }
}

/**
 * Editorias (assuntos): toda matéria pertence sempre a uma (Parte C do Plano
 * Mestre). Nunca hardcoded na interface — a lista vem sempre deste serviço.
 * Inativar não apaga: editorias já usadas por matérias continuam existindo,
 * só deixam de aparecer como opção para conteúdo novo.
 */
export class EditorialSectionService {
  constructor(private readonly sections: EditorialSectionRepository) {}

  list(): Promise<EditorialSection[]> {
    return this.sections.list();
  }

  async listActive(): Promise<EditorialSection[]> {
    const all = await this.sections.list();
    return all.filter((section) => section.active);
  }

  getById(id: string): Promise<EditorialSection | null> {
    return this.sections.getById(id);
  }

  async create(input: CreateEditorialSectionInput): Promise<EditorialSection> {
    const slug = slugify(input.slug || input.name);
    await this.assertSlugAvailable(slug);

    const all = await this.sections.list();
    const nextOrder = all.reduce((max, section) => Math.max(max, section.order), -1) + 1;

    const record: NewEditorialSectionRecord = {
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || undefined,
      active: input.active ?? true,
      order: nextOrder,
    };
    return this.sections.create(record);
  }

  async update(id: string, input: UpdateEditorialSectionInput): Promise<EditorialSection> {
    await this.assertExists(id);
    const changes: EditorialSectionChanges = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.description !== undefined) changes.description = input.description.trim() || undefined;
    if (input.slug !== undefined || input.name !== undefined) {
      const nextSlug = slugify(input.slug || input.name || "");
      if (nextSlug) {
        await this.assertSlugAvailable(nextSlug, id);
        changes.slug = nextSlug;
      }
    }
    return this.sections.update(id, changes);
  }

  async setActive(id: string, active: boolean): Promise<EditorialSection> {
    await this.assertExists(id);
    return this.sections.update(id, { active });
  }

  /** Redefine a ordem de exibição a partir da lista completa de ids na ordem desejada. */
  async reorder(orderedIds: string[]): Promise<EditorialSection[]> {
    const updated: EditorialSection[] = [];
    for (let index = 0; index < orderedIds.length; index += 1) {
      updated.push(await this.sections.update(orderedIds[index], { order: index }));
    }
    return updated;
  }

  private async assertExists(id: string): Promise<void> {
    const section = await this.sections.getById(id);
    if (!section) {
      throw new EditorialSectionNotFoundError(id);
    }
  }

  private async assertSlugAvailable(slug: string, ignoreId?: string): Promise<void> {
    const all = await this.sections.list();
    const conflict = all.some((section) => section.slug === slug && section.id !== ignoreId);
    if (conflict) {
      throw new DuplicateSlugError(slug);
    }
  }
}
