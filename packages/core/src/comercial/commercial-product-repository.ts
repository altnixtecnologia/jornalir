import type { CommercialChannel, CommercialProduct } from "@ir/types";

export type NewCommercialProductRecord = Omit<CommercialProduct, "id" | "createdAt" | "updatedAt">;
export type CommercialProductChanges = Partial<NewCommercialProductRecord>;

export interface CommercialProductListQuery {
  activeOnly?: boolean;
  channel?: CommercialChannel;
}

/** Catálogo simples — nunca excluído, só active=false (mesmo princípio de NFS-e ServiceProfileRepository). */
export interface CommercialProductRepository {
  list(query?: CommercialProductListQuery): Promise<CommercialProduct[]>;
  getById(id: string): Promise<CommercialProduct | null>;
  create(record: NewCommercialProductRecord): Promise<CommercialProduct>;
  update(id: string, changes: CommercialProductChanges): Promise<CommercialProduct>;
}
