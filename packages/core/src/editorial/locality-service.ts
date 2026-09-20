import type { Locality, LocalityScope } from "@ir/types";
import type { LocalityChanges, LocalityRepository, NewLocalityRecord } from "./locality-repository";
import { LocalityNotFoundError } from "./article-service";

export interface CreateLocalityInput {
  name: string;
  /** Gerada a partir do nome quando ausente. */
  slug?: string;
  scope: LocalityScope;
  active?: boolean;
}

export interface UpdateLocalityInput {
  name?: string;
  slug?: string;
  scope?: LocalityScope;
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

export class DuplicateLocalitySlugError extends Error {
  constructor(slug: string) {
    super(`Já existe uma localidade com o identificador "${slug}".`);
  }
}

/**
 * Cidade/região/abrangência geral — sempre independente da editoria (Parte
 * C do Plano Mestre). Inativar não apaga: localidades já usadas por
 * matérias continuam existindo, só deixam de aparecer como opção nova.
 */
export class LocalityService {
  constructor(private readonly localities: LocalityRepository) {}

  list(): Promise<Locality[]> {
    return this.localities.list();
  }

  async listActive(): Promise<Locality[]> {
    const all = await this.localities.list();
    return all.filter((locality) => locality.active);
  }

  getById(id: string): Promise<Locality | null> {
    return this.localities.getById(id);
  }

  async create(input: CreateLocalityInput): Promise<Locality> {
    const slug = slugify(input.slug || input.name);
    await this.assertSlugAvailable(slug);

    const record: NewLocalityRecord = {
      name: input.name.trim(),
      slug,
      scope: input.scope,
      active: input.active ?? true,
    };
    return this.localities.create(record);
  }

  async update(id: string, input: UpdateLocalityInput): Promise<Locality> {
    await this.assertExists(id);
    const changes: LocalityChanges = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.scope !== undefined) changes.scope = input.scope;
    if (input.slug !== undefined || input.name !== undefined) {
      const nextSlug = slugify(input.slug || input.name || "");
      if (nextSlug) {
        await this.assertSlugAvailable(nextSlug, id);
        changes.slug = nextSlug;
      }
    }
    return this.localities.update(id, changes);
  }

  async setActive(id: string, active: boolean): Promise<Locality> {
    await this.assertExists(id);
    return this.localities.update(id, { active });
  }

  private async assertExists(id: string): Promise<void> {
    const locality = await this.localities.getById(id);
    if (!locality) {
      throw new LocalityNotFoundError(id);
    }
  }

  private async assertSlugAvailable(slug: string, ignoreId?: string): Promise<void> {
    const all = await this.localities.list();
    const conflict = all.some((locality) => locality.slug === slug && locality.id !== ignoreId);
    if (conflict) {
      throw new DuplicateLocalitySlugError(slug);
    }
  }
}
