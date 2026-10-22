import { canTransitionCommercialSaleStatus, computeProposalItemTotal, type CommercialCondition, type CommercialSale, type CommercialSaleStatus, type CommercialSaleItemSnapshot } from "@ir/types";
import type {
  CommercialSaleChanges,
  CommercialSaleListQuery,
  CommercialSaleRepository,
  NewCommercialSaleRecord,
} from "./commercial-sale-repository";
import { CommercialSaleNotFoundError } from "./commercial-sale-repository";

export class CommercialSaleValidationError extends Error {}
export class CommercialSaleStatusTransitionError extends Error {}
/** Mantem o documento futuro coerente com os itens da proposta ja aceita. */
export class CommercialSaleSnapshotLockedError extends Error {
  constructor() {
    super("Esta venda veio de uma proposta com varios itens. Para alterar valores, cliente ou vigencia, revise a negociacao e formalize nova versao/aditivo; os itens originais permanecem preservados.");
  }
}
/** "Alteração após gerar Financeiro" (item 14 da tarefa original, auditoria
 * de integridade posterior) — nunca atualiza silenciosamente um campo que
 * mudaria a IDENTIDADE financeira da negociação (quem paga, quanto, em
 * quantas parcelas, em que condição) quando já existe título gerado; quem
 * chama (Server Action, que sabe consultar receivables) informa isso via
 * `options.financeiroGenerated`. channel/description/startDate/endDate/
 * notes continuam sempre editáveis — são campos "editoriais" (não
 * participam da geração de valor/vencimento: o vencimento de cada parcela
 * é escolhido no momento de "Gerar Financeiro", nunca recalculado a
 * partir de start_date/end_date depois). */
export class CommercialSaleFinanceiroAlreadyGeneratedError extends Error {
  constructor(field: "clientId" | "amount" | "installmentsCount" | "commercialCondition") {
    const messages: Record<typeof field, string> = {
      clientId: "Esta venda já tem Financeiro gerado — não é possível trocar o cliente/anunciante. Os títulos já existem em nome do cliente original; cancele a venda e crie uma nova se o cliente estiver errado.",
      amount: "Esta venda já tem Financeiro gerado — o valor não pode ser alterado aqui. Ajuste os títulos diretamente no Financeiro, preservando o histórico.",
      installmentsCount: "Esta venda já tem Financeiro gerado — o número de parcelas não pode ser alterado aqui. Ajuste os títulos diretamente no Financeiro, preservando o histórico.",
      commercialCondition: "Esta venda já tem Financeiro gerado — a condição comercial que originou os títulos não pode ser alterada aqui.",
    };
    super(messages[field]);
  }
}

export interface CommercialSaleInput {
  clientId: string;
  /** Preenchido só quando a venda nasce de uma proposta convertida — nunca editável depois de criada. */
  proposalId?: string;
  itemsSnapshot?: CommercialSaleItemSnapshot[];
  productId?: string;
  channel: string;
  description: string;
  startDate: string;
  endDate?: string;
  amount: number;
  commercialCondition: CommercialCondition;
  installmentsCount: number;
  notes?: string;
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalize(input: CommercialSaleInput, status: CommercialSaleStatus): NewCommercialSaleRecord {
  return {
    clientId: input.clientId,
    proposalId: trimOrUndefined(input.proposalId),
    ...(input.itemsSnapshot === undefined ? {} : { itemsSnapshot: input.itemsSnapshot }),
    productId: trimOrUndefined(input.productId),
    channel: input.channel.trim(),
    description: input.description.trim(),
    startDate: input.startDate,
    endDate: trimOrUndefined(input.endDate),
    amount: input.amount,
    commercialCondition: input.commercialCondition,
    installmentsCount: Math.max(1, Math.floor(input.installmentsCount)),
    status,
    notes: trimOrUndefined(input.notes),
  };
}

function assertValid(record: Pick<NewCommercialSaleRecord, "clientId" | "channel" | "description" | "startDate" | "amount" | "endDate">): void {
  if (!record.clientId) throw new CommercialSaleValidationError("Selecione o cliente/anunciante.");
  if (!record.channel) throw new CommercialSaleValidationError("Informe o produto/tipo de publicidade.");
  if (!record.description) throw new CommercialSaleValidationError("Informe a descrição.");
  if (!record.startDate) throw new CommercialSaleValidationError("Informe a data inicial.");
  if (!Number.isFinite(record.amount) || record.amount < 0) throw new CommercialSaleValidationError("Informe um valor válido.");
  if (record.endDate && record.endDate < record.startDate) throw new CommercialSaleValidationError("A data final não pode ser anterior à data inicial.");
}

/**
 * Venda/contratação comercial (publicidade) — deliberadamente simples
 * (nunca um ERP comercial). client_id sempre vem do Cadastro mestre
 * (quem chama resolve via ClientPicker, nunca um nome digitado aqui).
 */
export class CommercialSaleService {
  constructor(private readonly repository: CommercialSaleRepository) {}

  list(query?: CommercialSaleListQuery): Promise<CommercialSale[]> {
    return this.repository.list(query);
  }

  async getById(id: string): Promise<CommercialSale> {
    const sale = await this.repository.getById(id);
    if (!sale) throw new CommercialSaleNotFoundError(id);
    return sale;
  }

  async register(input: CommercialSaleInput): Promise<CommercialSale> {
    const record = normalize(input, "proposal");
    assertValid(record);
    if (record.itemsSnapshot !== undefined) {
      if (!record.proposalId || record.itemsSnapshot.length === 0) {
        throw new CommercialSaleValidationError("Os itens da venda devem vir de uma proposta válida.");
      }
      if (record.itemsSnapshot.some((item) =>
        !item.description.trim() || !item.productName.trim() ||
        !Number.isFinite(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.unitPrice) || item.unitPrice < 0 ||
        !item.sourceProposalItemId ||
        !Number.isFinite(item.discountAmount) || item.discountAmount < 0 ||
        !Number.isFinite(item.totalAmount) || item.totalAmount < 0 ||
        Math.abs(computeProposalItemTotal(item) - item.totalAmount) > 0.009
      )) throw new CommercialSaleValidationError("A proposta possui itens inválidos.");
      const total = Math.round(record.itemsSnapshot.reduce((sum, item) => sum + item.totalAmount, 0) * 100) / 100;
      if (Math.abs(total - record.amount) > 0.009) {
        throw new CommercialSaleValidationError("O total da venda não corresponde à soma dos serviços da proposta.");
      }
    }
    return this.repository.create(record);
  }

  async update(id: string, input: CommercialSaleInput, options: { financeiroGenerated?: boolean } = {}): Promise<CommercialSale> {
    const current = await this.getById(id);
    const changes: CommercialSaleChanges = normalize(input, current.status);
    assertValid(changes as Pick<NewCommercialSaleRecord, "clientId" | "channel" | "description" | "startDate" | "amount" | "endDate">);

    if (current.itemsSnapshot?.length && (
      changes.clientId !== current.clientId ||
      changes.amount !== current.amount ||
      changes.commercialCondition !== current.commercialCondition ||
      changes.startDate !== current.startDate ||
      changes.endDate !== current.endDate ||
      changes.productId !== current.productId
    )) throw new CommercialSaleSnapshotLockedError();

    // O snapshot pertence a origem e so pode ser gravado na criacao da venda.
    delete changes.itemsSnapshot;
    if (options.financeiroGenerated) {
      if (changes.clientId !== current.clientId) throw new CommercialSaleFinanceiroAlreadyGeneratedError("clientId");
      if (changes.amount !== current.amount) throw new CommercialSaleFinanceiroAlreadyGeneratedError("amount");
      if (changes.installmentsCount !== current.installmentsCount) throw new CommercialSaleFinanceiroAlreadyGeneratedError("installmentsCount");
      if (changes.commercialCondition !== current.commercialCondition) throw new CommercialSaleFinanceiroAlreadyGeneratedError("commercialCondition");
    }

    const { status: _status, ...changesWithoutStatus } = changes;
    return this.repository.update(id, changesWithoutStatus);
  }

  async changeStatus(id: string, to: CommercialSaleStatus): Promise<CommercialSale> {
    const current = await this.getById(id);
    if (current.status === to) return current;
    if (!canTransitionCommercialSaleStatus(current.status, to)) {
      throw new CommercialSaleStatusTransitionError(`Não é possível mudar de "${current.status}" para "${to}".`);
    }
    return this.repository.update(id, { status: to });
  }

  /** Nunca apaga fisicamente — mesmo com Financeiro já gerado, cancelar
   * só muda o status; os títulos já gerados continuam existindo e
   * rastreáveis (item 15). */
  cancel(id: string): Promise<CommercialSale> {
    return this.changeStatus(id, "cancelled");
  }
}
