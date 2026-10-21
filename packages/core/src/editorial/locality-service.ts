import type { Locality, LocalityScope } from "@ir/types";
import type { LocalityChanges, LocalityRepository, NewLocalityRecord } from "./locality-repository";
import { LocalityNotFoundError } from "./article-service";

export interface CreateLocalityInput {
  name: string;
  /** Gerada a partir do nome quando ausente. */
  slug?: string;
  scope: LocalityScope;
  stateCode?: string | null;
  active?: boolean;
}

export interface UpdateLocalityInput {
  name?: string;
  slug?: string;
  scope?: LocalityScope;
  stateCode?: string | null;
}

const UF_CODES = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);

/** Cidades/estados devem ter UF, demais abrangencias nao. */
function normalizeGeoState(scope: LocalityScope, code: string | null | undefined): string | null {
  if (scope !== "city" && scope !== "state") return null;
  const value = (code || "").trim().toUpperCase();
  if (!UF_CODES.has(value)) throw new Error("Selecione um estado válido para esta abrangência.");
  return value;
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
    const stateCode = normalizeGeoState(input.scope, input.stateCode);
    // Novas cidades incluem UF no identificador para permitir homonimos;
    // slugs existentes nao sao reescritos pela migration.
    const slug = slugify(input.slug || (input.scope === "city" && stateCode ? input.name + "-" + stateCode : input.name));
    await this.assertSlugAvailable(slug);
    await this.assertUniqueState(input.scope, stateCode);

    const record: NewLocalityRecord = {
      name: input.name.trim(),
      slug,
      scope: input.scope,
      stateCode,
      active: input.active ?? true,
    };
    return this.localities.create(record);
  }

  async update(id: string, input: UpdateLocalityInput): Promise<Locality> {
    const current = await this.localities.getById(id);
    if (!current) throw new LocalityNotFoundError(id);
    const scope = input.scope ?? current.scope;
    const stateCode = normalizeGeoState(scope, input.stateCode === undefined ? current.stateCode : input.stateCode);
    await this.assertUniqueState(scope, stateCode, id);
    const changes: LocalityChanges = { stateCode };
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

  private async assertUniqueState(scope: LocalityScope, uf: string | null, ignoreId?: string): Promise<void> {
    if (scope !== "state" || !uf) return;
    const rows = await this.localities.list();
    if (rows.some((row) => row.scope === "state" && row.stateCode === uf && row.id !== ignoreId)) {
      throw new Error("Este estado já está cadastrado. Edite o registro existente.");
    }
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
