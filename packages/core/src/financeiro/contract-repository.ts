import type { ContractDocument, InstitutionalContract } from "@ir/types";

export type NewContractRecord = Omit<InstitutionalContract, "id" | "reference" | "createdAt" | "updatedAt">;
export type ContractChanges = Partial<NewContractRecord>;

export type NewContractDocumentRecord = Omit<ContractDocument, "id" | "uploadedByProfileId" | "createdAt">;

export class ContractValidationError extends Error {}

export interface ContractListQuery {
  clientId?: string;
  status?: InstitutionalContract["status"];
}

export interface ContractRepository {
  list(query?: ContractListQuery): Promise<InstitutionalContract[]>;
  getById(id: string): Promise<InstitutionalContract | null>;
  create(record: NewContractRecord): Promise<InstitutionalContract>;
  update(id: string, changes: ContractChanges): Promise<InstitutionalContract>;

  listDocuments(contractId: string): Promise<ContractDocument[]>;
  addDocument(record: NewContractDocumentRecord): Promise<ContractDocument>;
}
