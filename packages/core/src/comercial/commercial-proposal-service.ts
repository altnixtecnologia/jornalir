import {
  canTransitionCommercialProposalStatus,
  type CommercialCondition,
  type CommercialProposal,
  type CommercialProposalStatus,
  type CommercialProposalWithItems,
} from "@ir/types";
import type {
  CommercialProposalListQuery,
  CommercialProposalRepository,
  NewCommercialProposalRecord,
} from "./commercial-proposal-repository";
import { CommercialProposalNotFoundError } from "./commercial-proposal-repository";

export class CommercialProposalValidationError extends Error {}
export class CommercialProposalStatusTransitionError extends Error {}
export class CommercialProposalNotEditableError extends Error {
  constructor() {
    super("Esta proposta não pode mais ser editada — só propostas em rascunho ou enviadas aceitam alteração.");
  }
}
/** Proteção real contra conversão duplicada — mesmo espírito das outras idempotências do módulo (ver registerFromCommercialSale). */
export class CommercialProposalAlreadyConvertedError extends Error {
  constructor() {
    super("Esta proposta já foi convertida em venda — não é possível converter de novo.");
  }
}

export interface CommercialProposalItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}

export interface CommercialProposalInput {
  clientId: string;
  proposalDate: string;
  validUntil?: string;
  commercialCondition: CommercialCondition;
  notes?: string;
  internalNotes?: string;
  items: CommercialProposalItemInput[];
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalize(input: CommercialProposalInput): NewCommercialProposalRecord {
  return {
    clientId: input.clientId,
    proposalDate: input.proposalDate,
    validUntil: trimOrUndefined(input.validUntil),
    commercialCondition: input.commercialCondition,
    notes: trimOrUndefined(input.notes),
    internalNotes: trimOrUndefined(input.internalNotes),
  };
}

function normalizeItems(items: CommercialProposalItemInput[]) {
  return items.map((item, index) => ({
    productId: trimOrUndefined(item.productId),
    description: item.description.trim(),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    sortOrder: index,
  }));
}

function assertValid(record: NewCommercialProposalRecord, items: CommercialProposalItemInput[]): void {
  if (!record.clientId) throw new CommercialProposalValidationError("Selecione o cliente.");
  if (!record.proposalDate) throw new CommercialProposalValidationError("Informe a data da proposta.");
  if (record.validUntil && record.validUntil < record.proposalDate) {
    throw new CommercialProposalValidationError("A validade não pode ser anterior à data da proposta.");
  }
  if (items.length === 0) throw new CommercialProposalValidationError("Adicione ao menos um item.");
  for (const item of items) {
    if (!item.description.trim()) throw new CommercialProposalValidationError("Todo item precisa de uma descrição.");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new CommercialProposalValidationError("Informe uma quantidade válida.");
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new CommercialProposalValidationError("Informe um valor unitário válido.");
    if (!Number.isFinite(item.discountAmount) || item.discountAmount < 0) throw new CommercialProposalValidationError("Informe um desconto válido.");
    if (item.discountAmount > item.quantity * item.unitPrice) {
      throw new CommercialProposalValidationError("O desconto não pode ser maior que o subtotal do item.");
    }
  }
}

/**
 * Proposta/orçamento comercial — documento PRÉ-venda, deliberadamente
 * simples. client_id sempre vem do Cadastro mestre (ClientPicker, nunca
 * nome digitado aqui). Itens ficam travados pra edição depois que a
 * proposta sai de draft/sent (mesmo espírito do "trava depois de gerar
 * Financeiro" de CommercialSaleService — aqui a trava é a DECISÃO
 * (aprovada/recusada/arquivada), não um título gerado).
 */
export class CommercialProposalService {
  constructor(private readonly repository: CommercialProposalRepository) {}

  list(query?: CommercialProposalListQuery): Promise<CommercialProposal[]> {
    return this.repository.list(query);
  }

  async getById(id: string): Promise<CommercialProposal> {
    const proposal = await this.repository.getById(id);
    if (!proposal) throw new CommercialProposalNotFoundError(id);
    return proposal;
  }

  async getWithItems(id: string): Promise<CommercialProposalWithItems> {
    const proposal = await this.repository.getWithItems(id);
    if (!proposal) throw new CommercialProposalNotFoundError(id);
    return proposal;
  }

  async register(input: CommercialProposalInput): Promise<CommercialProposalWithItems> {
    const record = normalize(input);
    const items = normalizeItems(input.items);
    assertValid(record, input.items);
    return this.repository.createWithItems(record, items);
  }

  async update(id: string, input: CommercialProposalInput): Promise<CommercialProposalWithItems> {
    const current = await this.getById(id);
    if (current.status !== "draft" && current.status !== "sent") throw new CommercialProposalNotEditableError();

    const record = normalize(input);
    const items = normalizeItems(input.items);
    assertValid(record, input.items);

    await this.repository.update(id, record);
    return this.repository.replaceItems(id, items);
  }

  async changeStatus(id: string, to: CommercialProposalStatus): Promise<CommercialProposal> {
    const current = await this.getById(id);
    if (current.status === to) return current;
    if (!canTransitionCommercialProposalStatus(current.status, to)) {
      throw new CommercialProposalStatusTransitionError(`Não é possível mudar de "${current.status}" para "${to}".`);
    }
    return this.repository.update(id, { status: to });
  }

  archive(id: string): Promise<CommercialProposal> {
    return this.changeStatus(id, "archived");
  }

  /** Cópia simples: nova proposta em draft, mesmos dados/itens, nunca convertida (começa sempre sem convertedSaleId). */
  async duplicate(id: string): Promise<CommercialProposalWithItems> {
    const source = await this.getWithItems(id);
    return this.repository.createWithItems(
      {
        clientId: source.clientId,
        proposalDate: new Date().toISOString().slice(0, 10),
        validUntil: source.validUntil,
        commercialCondition: source.commercialCondition,
        notes: source.notes,
        internalNotes: source.internalNotes,
      },
      source.items.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        sortOrder: item.sortOrder,
      })),
    );
  }

  /** Só marca o vínculo — a criação da commercial_sale em si acontece na camada de composição/Server Action (evita acoplar este service a CommercialSaleService). Nunca permite marcar duas vezes. */
  async markConverted(id: string, saleId: string): Promise<CommercialProposal> {
    const current = await this.getById(id);
    if (current.convertedSaleId) throw new CommercialProposalAlreadyConvertedError();
    if (current.status !== "approved") {
      throw new CommercialProposalValidationError("Só é possível converter uma proposta aprovada.");
    }
    return this.repository.update(id, { convertedSaleId: saleId });
  }
}
