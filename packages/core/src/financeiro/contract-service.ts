import { canTransitionContractStatus, CONTRACT_STATUS_LABELS } from "@ir/types";
import type {
  ContractAmendment,
  ContractCommitmentOrder,
  ContractDocument,
  ContractDocumentExtractedData,
  ContractDocumentType,
  ContractStatus,
  InstitutionalContract,
} from "@ir/types";
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

/** Mesmo princípio de ReceivableStatusTransitionError/SubscriptionStatusTransitionError — nunca sai silenciosamente de um estado pra outro não permitido (Bloco 2, item 2). */
export class ContractStatusTransitionError extends Error {}

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
  amendmentNumber?: string;
  effectiveDate?: string;
  documentId?: string;
  reason?: string;
  notes?: string;
}

export interface CommitmentOrderInput {
  number: string;
  issueDate: string;
  amount?: number;
  competencyDate?: string;
  description?: string;
  documentId?: string;
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
    const current = await this.getById(id);
    const changes = normalize(input);
    assertValid(changes);
    if (changes.status !== current.status && !canTransitionContractStatus(current.status, changes.status)) {
      throw new ContractStatusTransitionError(
        `Não é possível mudar o status de "${CONTRACT_STATUS_LABELS[current.status]}" para "${CONTRACT_STATUS_LABELS[changes.status]}".`,
      );
    }
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
   * Registra um aditivo (Parte 3B, item 9 + Bloco 2, item 3) — NUNCA
   * altera contractedAmount/endsAt do contrato diretamente; valor e
   * vigência vigentes continuam sendo calculados
   * (computeEffectiveContractAmount/computeEffectiveContractEndsAt em
   * @ir/types) a partir do original + todos os aditivos, preservando
   * histórico completo. Sem gestão jurídica complexa de propósito.
   * `amount` pode ser negativo (redução de valor) — só nunca zero.
   */
  async addAmendment(contractId: string, input: ContractAmendmentInput): Promise<ContractAmendment> {
    await this.getById(contractId);
    if (!Number.isFinite(input.amount) || input.amount === 0) throw new ContractValidationError("Informe um valor de aditivo válido (diferente de zero — positivo pra acréscimo, negativo pra redução).");
    return this.contracts.addAmendment({
      contractId,
      amount: input.amount,
      newEndsAt: input.newEndsAt || undefined,
      amendmentNumber: trimOrUndefined(input.amendmentNumber),
      effectiveDate: input.effectiveDate || undefined,
      documentId: trimOrUndefined(input.documentId),
      reason: trimOrUndefined(input.reason),
      notes: trimOrUndefined(input.notes),
    });
  }

  listCommitmentOrders(contractId: string): Promise<ContractCommitmentOrder[]> {
    return this.contracts.listCommitmentOrders(contractId);
  }

  /**
   * Registra um empenho (Bloco 2, item 4) — entidade própria, nunca
   * presume que todo título exige um. `amount`/`competencyDate` são
   * opcionais de propósito (alguns órgãos emitem empenho sem valor
   * fechado, ou um único empenho global cobrindo vários meses).
   */
  async addCommitmentOrder(contractId: string, input: CommitmentOrderInput): Promise<ContractCommitmentOrder> {
    await this.getById(contractId);
    if (!input.number.trim()) throw new ContractValidationError("Informe o número do empenho.");
    if (!input.issueDate) throw new ContractValidationError("Informe a data do empenho.");
    if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) {
      throw new ContractValidationError("Se informado, o valor do empenho deve ser maior que zero.");
    }
    return this.contracts.addCommitmentOrder({
      contractId,
      number: input.number.trim(),
      issueDate: input.issueDate,
      amount: input.amount,
      competencyDate: input.competencyDate || undefined,
      description: trimOrUndefined(input.description),
      documentId: trimOrUndefined(input.documentId),
      notes: trimOrUndefined(input.notes),
    });
  }
}
