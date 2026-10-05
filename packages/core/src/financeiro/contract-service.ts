import type { ContractAmendment, ContractDocument, ContractDocumentExtractedData, ContractDocumentType, ContractStatus, InstitutionalContract } from "@ir/types";
import {
  ContractValidationError,
  type ContractListQuery,
  type ContractRepository,
  type NewContractRecord,
} from "./contract-repository";

export class ContractNotFoundError extends Error {
  constructor(id: string) {
    super(`Contrato não encontrado: ${id}`);
  }
}

export interface ContractInput {
  clientId: string;
  contractNumber?: string;
  processNumber?: string;
  modality?: string;
  biddingReference?: string;
  object?: string;
  contractedAmount?: number;
  startsAt?: string;
  endsAt?: string;
  status?: ContractStatus;
  notes?: string;
  extraData?: Record<string, unknown>;
}

export interface ContractDocumentInput {
  documentType: ContractDocumentType;
  name: string;
  fileReference?: string;
  documentDate?: string;
  notes?: string;
  /** Resultado bruto de uma extração automática — sempre auxílio, nunca aplicado automaticamente aos campos reais do contrato (ver regra absoluta da Parte 3A, item 11). */
  extractedData?: ContractDocumentExtractedData;
}

export interface ContractAmendmentInput {
  amount: number;
  newEndsAt?: string;
  documentId?: string;
  reason?: string;
  notes?: string;
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalize(input: ContractInput): NewContractRecord {
  return {
    clientId: input.clientId,
    contractNumber: trimOrUndefined(input.contractNumber),
    processNumber: trimOrUndefined(input.processNumber),
    modality: trimOrUndefined(input.modality),
    biddingReference: trimOrUndefined(input.biddingReference),
    object: trimOrUndefined(input.object),
    contractedAmount: input.contractedAmount,
    startsAt: input.startsAt || undefined,
    endsAt: input.endsAt || undefined,
    status: input.status ?? "active",
    notes: trimOrUndefined(input.notes),
    extraData: input.extraData,
  };
}

function assertValid(record: Pick<NewContractRecord, "clientId" | "startsAt" | "endsAt">): void {
  if (!record.clientId) throw new ContractValidationError("Selecione o cliente/órgão deste contrato.");
  if (record.startsAt && record.endsAt && record.endsAt < record.startsAt) {
    throw new ContractValidationError("O fim da vigência não pode ser anterior ao início.");
  }
}

/**
 * Contrato institucional como entidade própria (Parte 3A, item 10) — um
 * contrato pode gerar vários títulos (ReceivableService). Poucos campos
 * obrigatórios de propósito: cada órgão trabalha de forma diferente.
 * Documentos anexados (item 12) guardam extractedData como AUXÍLIO
 * bruto — nunca aplicado automaticamente aos campos do contrato; é
 * sempre o usuário quem confere e decide o que entra via update().
 */
export class ContractService {
  constructor(private readonly contracts: ContractRepository) {}

  list(query?: ContractListQuery): Promise<InstitutionalContract[]> {
    return this.contracts.list(query);
  }

  async getById(id: string): Promise<InstitutionalContract> {
    const contract = await this.contracts.getById(id);
    if (!contract) throw new ContractNotFoundError(id);
    return contract;
  }

  register(input: ContractInput): Promise<InstitutionalContract> {
    const record = normalize(input);
    assertValid(record);
    return this.contracts.create(record);
  }

  async update(id: string, input: ContractInput): Promise<InstitutionalContract> {
    await this.getById(id);
    const changes = normalize(input);
    assertValid(changes);
    return this.contracts.update(id, changes);
  }

  listDocuments(contractId: string): Promise<ContractDocument[]> {
    return this.contracts.listDocuments(contractId);
  }

  /** Anexa um documento — extractedData (quando houver) fica guardado
   * só como referência bruta da extração; NUNCA altera os campos reais
   * do contrato por conta própria. Quem decide o que aproveitar é o
   * usuário, via update() explícito depois de conferir. */
  async addDocument(contractId: string, input: ContractDocumentInput): Promise<ContractDocument> {
    await this.getById(contractId);
    if (!input.name.trim()) throw new ContractValidationError("Informe um nome/descrição para o documento.");
    return this.contracts.addDocument({
      contractId,
      documentType: input.documentType,
      name: input.name.trim(),
      fileReference: trimOrUndefined(input.fileReference),
      documentDate: input.documentDate || undefined,
      notes: trimOrUndefined(input.notes),
      extractedData: input.extractedData,
    });
  }

  listAmendments(contractId: string): Promise<ContractAmendment[]> {
    return this.contracts.listAmendments(contractId);
  }

  /**
   * Registra um aditivo (Parte 3B, item 9) — NUNCA altera
   * contractedAmount/endsAt do contrato diretamente; valor e vigência
   * vigentes continuam sendo calculados (computeEffectiveContractAmount/
   * computeEffectiveContractEndsAt em @ir/types) a partir do original +
   * todos os aditivos, preservando histórico completo. Sem gestão
   * jurídica complexa de propósito.
   */
  async addAmendment(contractId: string, input: ContractAmendmentInput): Promise<ContractAmendment> {
    await this.getById(contractId);
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ContractValidationError("Informe um valor de aditivo válido (maior que zero).");
    return this.contracts.addAmendment({
      contractId,
      amount: input.amount,
      newEndsAt: input.newEndsAt || undefined,
      documentId: trimOrUndefined(input.documentId),
      reason: trimOrUndefined(input.reason),
      notes: trimOrUndefined(input.notes),
    });
  }
}
