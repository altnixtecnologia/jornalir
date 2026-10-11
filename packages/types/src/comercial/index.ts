// Módulo Comercial/Publicidade — venda/contratação comercial. client_id
// SEMPRE referencia public.clients (Cadastro mestre, módulo `clientes`) —
// nenhum nome/CPF/CNPJ/telefone/e-mail/endereço é duplicado aqui, mesmo
// princípio já usado em Assinaturas/NFS-e/Financeiro.

export type CommercialChannel = "newspaper" | "website" | "led_panel" | "social_media" | "package" | "other";
export const COMMERCIAL_CHANNELS: readonly CommercialChannel[] = ["newspaper", "website", "led_panel", "social_media", "package", "other"];
export const COMMERCIAL_CHANNEL_LABELS: Record<CommercialChannel, string> = {
  newspaper: "Jornal impresso",
  website: "Site",
  led_panel: "Painel LED",
  social_media: "Redes sociais",
  package: "Pacote/combinado",
  other: "Outro",
};

export type CommercialSaleStatus = "proposal" | "approved" | "active" | "completed" | "cancelled";
export const COMMERCIAL_SALE_STATUSES: readonly CommercialSaleStatus[] = ["proposal", "approved", "active", "completed", "cancelled"];
export const COMMERCIAL_SALE_STATUS_LABELS: Record<CommercialSaleStatus, string> = {
  proposal: "Proposta",
  approved: "Aprovada",
  active: "Em veiculação",
  completed: "Concluída",
  cancelled: "Cancelada",
};

/** Cancelado é estado final, nunca volta — mesmo princípio de RECEIVABLE_STATUS_TRANSITIONS/SUBSCRIPTION_STATUS_TRANSITIONS. */
export const COMMERCIAL_SALE_STATUS_TRANSITIONS: Record<CommercialSaleStatus, readonly CommercialSaleStatus[]> = {
  proposal: ["approved", "active", "cancelled"],
  approved: ["active", "completed", "cancelled"],
  active: ["completed", "cancelled"],
  completed: ["cancelled"],
  cancelled: [],
};

export function canTransitionCommercialSaleStatus(from: CommercialSaleStatus, to: CommercialSaleStatus): boolean {
  return COMMERCIAL_SALE_STATUS_TRANSITIONS[from].includes(to);
}

/** Condição NEGOCIADA — distinta da forma de liquidação real de cada
 * título no Financeiro (PaymentMethod). Ver comentário na migration. */
export type CommercialCondition = "cash" | "installments" | "trade" | "bailment" | "courtesy" | "other";
export const COMMERCIAL_CONDITIONS: readonly CommercialCondition[] = ["cash", "installments", "trade", "bailment", "courtesy", "other"];
export const COMMERCIAL_CONDITION_LABELS: Record<CommercialCondition, string> = {
  cash: "À vista",
  installments: "Parcelado",
  trade: "Permuta",
  bailment: "Comodato",
  courtesy: "Cortesia",
  other: "Outro",
};

export interface CommercialProduct {
  id: string;
  name: string;
  channel: CommercialChannel;
  description?: string;
  suggestedPrice?: number;
  active: boolean;
  createdByProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialSale {
  id: string;
  reference: string;
  clientId: string;
  /** Proposta de origem, quando a venda nasceu de uma conversão (ver CommercialProposal.convertedSaleId) — nunca obrigatório. */
  proposalId?: string;
  /** Só rastreabilidade ao catálogo — nunca a fonte de verdade da venda já fechada (ver `channel`). */
  productId?: string;
  /** Snapshot de texto (rótulo do canal no momento da venda) — mesmo princípio de NfseTomadorSnapshot: nunca recalculado via join obrigatório ao catálogo. */
  channel: string;
  description: string;
  startDate: string;
  endDate?: string;
  amount: number;
  commercialCondition: CommercialCondition;
  installmentsCount: number;
  status: CommercialSaleStatus;
  notes?: string;
  createdByProfileId?: string;
  updatedByProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

/** "Situação financeira" exibida na listagem/detalhe (item 23) — SEMPRE
 * calculada a partir dos receivables vinculados, nunca um campo próprio
 * gravado (mesmo princípio de recomputeReceivableStatus/ReceivableDueFlag:
 * nunca duplica o que o Financeiro já sabe calcular). */
export type CommercialSaleFinancialStatus = "not_generated" | "pending" | "partial" | "paid" | "overdue";
export const COMMERCIAL_SALE_FINANCIAL_STATUS_LABELS: Record<CommercialSaleFinancialStatus, string> = {
  not_generated: "Não gerado",
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Vencido",
};

/** Resumo mínimo de um título vinculado — só o que esta função precisa, pra não acoplar @ir/types a ReceivableWithBalance inteiro. */
export interface LinkedReceivableSummary {
  status: "open" | "partially_paid" | "paid" | "cancelled";
  dueDate: string;
}

export function deriveCommercialSaleFinancialStatus(
  receivables: readonly LinkedReceivableSummary[],
  today: Date = new Date(),
): CommercialSaleFinancialStatus {
  const active = receivables.filter((r) => r.status !== "cancelled");
  if (active.length === 0) return "not_generated";

  const reference = new Date(today);
  reference.setHours(0, 0, 0, 0);
  const hasOverdue = active.some((r) => r.status !== "paid" && new Date(`${r.dueDate}T00:00:00`) < reference);
  if (hasOverdue) return "overdue";

  if (active.every((r) => r.status === "paid")) return "paid";
  if (active.some((r) => r.status === "partially_paid" || r.status === "paid")) return "partial";
  return "pending";
}

/**
 * Descrição útil para cobrança (item 27) — texto que o Financeiro/
 * WhatsApp usa pra dizer o que está sendo cobrado. Nunca uma frase
 * hardcoded independente dos dados reais da venda: sempre monta a
 * partir de channel/description/período, que são os campos reais.
 */
export function buildCommercialBillingDescription(sale: Pick<CommercialSale, "channel" | "description" | "startDate" | "endDate">): string {
  const period = sale.endDate ? `${formatCompactDate(sale.startDate)} a ${formatCompactDate(sale.endDate)}` : `a partir de ${formatCompactDate(sale.startDate)}`;
  return `Publicidade — ${sale.channel} — ${sale.description} (${period})`;
}

function formatCompactDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export interface CommercialInstallmentDraft {
  installmentNumber: number;
  amount: number;
  dueDate: string;
  description: string;
}

/**
 * Parcelas de uma venda comercial (item 11) — mesmo espírito puro/sem
 * banco de generateContractInstallments (packages/core/src/financeiro/
 * contract-installments.ts): só monta a prévia, cada parcela pode ser
 * ajustada antes de a aplicação gerar os receivables de fato. Vencimento
 * de cada parcela = endDate (ou startDate, se não houver endDate) + N
 * meses a partir da primeira, nunca inventado — a primeira parcela
 * sempre vence na data informada por quem chama.
 */
export function generateCommercialSaleInstallments(
  sale: Pick<CommercialSale, "reference" | "channel" | "description" | "amount" | "installmentsCount">,
  firstDueDate: string,
): CommercialInstallmentDraft[] {
  const count = Math.max(1, Math.floor(sale.installmentsCount));
  const base = Math.floor((sale.amount / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => base);
  const remainder = Math.round((sale.amount - base * count) * 100) / 100;
  if (remainder !== 0) amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1] + remainder) * 100) / 100;

  const drafts: CommercialInstallmentDraft[] = [];
  for (let index = 0; index < count; index += 1) {
    const dueDate = addMonths(firstDueDate, index);
    drafts.push({
      installmentNumber: index + 1,
      amount: amounts[index],
      dueDate,
      description: count > 1 ? `Venda ${sale.reference} — parcela ${index + 1}/${count}` : `Venda ${sale.reference}`,
    });
  }
  return drafts;
}

function addMonths(dateIso: string, months: number): string {
  const date = new Date(`${dateIso}T00:00:00`);
  const day = date.getDate();
  const targetMonth = date.getMonth() + months;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(targetYear, normalizedMonth, clampedDay).toISOString().slice(0, 10);
}

// --- Propostas/Orçamentos ---------------------------------------------
//
// Documento PRÉ-venda — pode nunca virar venda (recusada/arquivada é
// normal, nunca um erro). "Vencida" nunca é um status gravado, sempre
// derivado comparando valid_until com hoje (mesmo princípio de
// ReceivableDueFlag) — só faz sentido enquanto o status ainda é
// draft/sent, igual a dueFlag só fazer sentido pra título aberto/parcial.

export type CommercialProposalStatus = "draft" | "sent" | "approved" | "rejected" | "archived";
export const COMMERCIAL_PROPOSAL_STATUSES: readonly CommercialProposalStatus[] = ["draft", "sent", "approved", "rejected", "archived"];
export const COMMERCIAL_PROPOSAL_STATUS_LABELS: Record<CommercialProposalStatus, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  approved: "Aprovada",
  rejected: "Recusada",
  archived: "Arquivada",
};

/** Arquivada é estado final, nunca volta. Recusada só pode ser arquivada (nunca "reaberta" direto — uma nova proposta é sempre mais simples/seguro que reabrir uma recusada). */
export const COMMERCIAL_PROPOSAL_STATUS_TRANSITIONS: Record<CommercialProposalStatus, readonly CommercialProposalStatus[]> = {
  draft: ["sent", "approved", "rejected", "archived"],
  sent: ["approved", "rejected", "archived"],
  approved: ["archived"],
  rejected: ["archived"],
  archived: [],
};

export function canTransitionCommercialProposalStatus(from: CommercialProposalStatus, to: CommercialProposalStatus): boolean {
  return COMMERCIAL_PROPOSAL_STATUS_TRANSITIONS[from].includes(to);
}

export interface CommercialProposalItem {
  id: string;
  proposalId: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  sortOrder: number;
  createdAt: string;
}

export type NewCommercialProposalItemInput = Pick<CommercialProposalItem, "productId" | "description" | "quantity" | "unitPrice" | "discountAmount" | "sortOrder">;

/** Total de um item — SEMPRE calculado, nunca gravado (mesmo princípio de recomputeReceivableStatus). */
export function computeProposalItemTotal(item: Pick<CommercialProposalItem, "quantity" | "unitPrice" | "discountAmount">): number {
  return Math.round((item.quantity * item.unitPrice - item.discountAmount) * 100) / 100;
}

/** Total da proposta — soma dos itens, nunca uma coluna própria. */
export function computeProposalTotal(items: readonly Pick<CommercialProposalItem, "quantity" | "unitPrice" | "discountAmount">[]): number {
  return Math.round(items.reduce((sum, item) => sum + computeProposalItemTotal(item), 0) * 100) / 100;
}

export interface CommercialProposal {
  id: string;
  reference: string;
  clientId: string;
  proposalDate: string;
  validUntil?: string;
  commercialCondition: CommercialCondition;
  status: CommercialProposalStatus;
  /** Preenchido quando convertida em venda — nunca apagado depois; proteção real contra conversão duplicada é a checagem no service, não só este campo. */
  convertedSaleId?: string;
  notes?: string;
  internalNotes?: string;
  createdByProfileId?: string;
  updatedByProfileId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialProposalWithItems extends CommercialProposal {
  items: CommercialProposalItem[];
  total: number;
}

/** "Vencida" — só faz sentido enquanto ainda não foi decidida (draft/sent); nunca sobrepõe aprovada/recusada/arquivada. */
export function isCommercialProposalExpired(proposal: Pick<CommercialProposal, "validUntil" | "status">, today: Date = new Date()): boolean {
  if (!proposal.validUntil) return false;
  if (proposal.status !== "draft" && proposal.status !== "sent") return false;
  const reference = new Date(today);
  reference.setHours(0, 0, 0, 0);
  return new Date(`${proposal.validUntil}T00:00:00`) < reference;
}
