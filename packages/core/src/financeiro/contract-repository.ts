import type { ContractAmendment, ContractCommitmentOrder, ContractDocument, InstitutionalContract } from "@ir/types";

export type NewContractRecord = Omit<InstitutionalContract, "id" | "reference" | "createdAt" | "updatedAt">;
export type ContractChanges = Partial<NewContractRecord>;

export type NewContractDocumentRecord = Omit<ContractDocument, "id" | "uploadedByProfileId" | "createdAt">;
export type NewContractAmendmentRecord = Omit<ContractAmendment, "id" | "createdByProfileId" | "createdAt">;
export type NewCommitmentOrderRecord = Omit<ContractCommitmentOrder, "id" | "createdByProfileId" | "createdAt">;

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

  listAmendments(contractId: string): Promise<ContractAmendment[]>;
  addAmendment(record: NewContractAmendmentRecord): Promise<ContractAmendment>;

  listCommitmentOrders(contractId: string): Promise<ContractCommitmentOrder[]>;
  addCommitmentOrder(record: NewCommitmentOrderRecord): Promise<ContractCommitmentOrder>;
}
