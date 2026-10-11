import type { CommercialProposal, CommercialProposalStatus, CommercialProposalWithItems, NewCommercialProposalItemInput } from "@ir/types";

export type NewCommercialProposalRecord = Omit<
  CommercialProposal,
  "id" | "reference" | "status" | "convertedSaleId" | "createdByProfileId" | "updatedByProfileId" | "createdAt" | "updatedAt"
>;
export type CommercialProposalChanges = Partial<Omit<NewCommercialProposalRecord, never>> & { status?: CommercialProposalStatus; convertedSaleId?: string };

export interface CommercialProposalListQuery {
  clientId?: string;
  status?: CommercialProposalStatus;
  search?: string;
}

export class CommercialProposalNotFoundError extends Error {
  constructor(id: string) {
    super(`Proposta comercial não encontrada: ${id}`);
  }
}

/** Deliberadamente SEM método de exclusão da proposta em si — mesmo princípio de CommercialSaleRepository: nada aqui some, só muda de status (archived). Itens têm delete real (ver migration) pois a proposta pode ser reeditada livremente enquanto draft/sent. */
export interface CommercialProposalRepository {
  list(query?: CommercialProposalListQuery): Promise<CommercialProposal[]>;
  getById(id: string): Promise<CommercialProposal | null>;
  getWithItems(id: string): Promise<CommercialProposalWithItems | null>;
  /** Cria a proposta + todos os itens numa única operação — nunca proposta "órfã" sem nenhum item, nunca itens sem proposta. */
  createWithItems(record: NewCommercialProposalRecord, items: NewCommercialProposalItemInput[]): Promise<CommercialProposalWithItems>;
  /** Substitui TODOS os itens (delete + insert) — mais simples e seguro que diff item a item; só chamado enquanto a proposta ainda é editável (draft/sent), nunca depois. */
  replaceItems(proposalId: string, items: NewCommercialProposalItemInput[]): Promise<CommercialProposalWithItems>;
  update(id: string, changes: CommercialProposalChanges): Promise<CommercialProposal>;
}
