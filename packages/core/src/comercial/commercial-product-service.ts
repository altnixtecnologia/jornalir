import type { CommercialChannel, CommercialProduct } from "@ir/types";
import type {
  CommercialProductChanges,
  CommercialProductListQuery,
  CommercialProductRepository,
  NewCommercialProductRecord,
} from "./commercial-product-repository";

export class CommercialProductValidationError extends Error {}
export class CommercialProductNotFoundError extends Error {
  constructor(id: string) {
    super(`Produto comercial não encontrado: ${id}`);
  }
}

export interface CommercialProductInput {
  name: string;
  channel: CommercialChannel;
  description?: string;
  suggestedPrice?: number;
  active?: boolean;
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalize(input: CommercialProductInput): NewCommercialProductRecord {
  return {
    name: input.name.trim(),
    channel: input.channel,
    description: trimOrUndefined(input.description),
    suggestedPrice: input.suggestedPrice,
    active: input.active ?? true,
  };
}

function assertValid(record: Pick<NewCommercialProductRecord, "name" | "channel">): void {
  if (!record.name) throw new CommercialProductValidationError("Informe o nome do produto/canal.");
  if (!record.channel) throw new CommercialProductValidationError("Informe o canal.");
}

export class CommercialProductService {
  constructor(private readonly repository: CommercialProductRepository) {}

  list(query?: CommercialProductListQuery): Promise<CommercialProduct[]> {
    return this.repository.list(query);
  }

  async getById(id: string): Promise<CommercialProduct> {
    const product = await this.repository.getById(id);
    if (!product) throw new CommercialProductNotFoundError(id);
    return product;
  }

  async create(input: CommercialProductInput): Promise<CommercialProduct> {
    const record = normalize(input);
    assertValid(record);
    return this.repository.create(record);
  }

  async update(id: string, input: CommercialProductInput): Promise<CommercialProduct> {
    const changes: CommercialProductChanges = normalize(input);
    assertValid(changes as Pick<NewCommercialProductRecord, "name" | "channel">);
    return this.repository.update(id, changes);
  }

  /** Nunca excluído — só desativado, mesmo princípio de ServiceProfileService. */
  deactivate(id: string): Promise<CommercialProduct> {
    return this.repository.update(id, { active: false });
  }

  activate(id: string): Promise<CommercialProduct> {
    return this.repository.update(id, { active: true });
  }
}
