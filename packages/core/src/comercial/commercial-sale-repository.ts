import type { CommercialSale, CommercialSaleStatus } from "@ir/types";

export type NewCommercialSaleRecord = Omit<CommercialSale, "id" | "reference" | "createdByProfileId" | "updatedByProfileId" | "createdAt" | "updatedAt">;
export type CommercialSaleChanges = Partial<NewCommercialSaleRecord>;

export interface CommercialSaleListQuery {
  clientId?: string;
  status?: CommercialSaleStatus;
  search?: string;
  startFrom?: string;
  startTo?: string;
}

export class CommercialSaleNotFoundError extends Error {
  constructor(id: string) {
    super(`Venda comercial não encontrada: ${id}`);
  }
}

/** Deliberadamente SEM método de exclusão — mesmo princípio de ReceivableRepository/ContractRepository/DraftRepository: nada neste módulo some, só muda de status (cancelled). */
export interface CommercialSaleRepository {
  list(query?: CommercialSaleListQuery): Promise<CommercialSale[]>;
  getById(id: string): Promise<CommercialSale | null>;
  create(record: NewCommercialSaleRecord): Promise<CommercialSale>;
  update(id: string, changes: CommercialSaleChanges): Promise<CommercialSale>;
}
