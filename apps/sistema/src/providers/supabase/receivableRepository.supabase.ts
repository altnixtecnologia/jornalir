import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PaymentMethod,
  Receivable,
  ReceivableAdjustment,
  ReceivableReceipt,
  ReceivableSourceType,
  ReceivableStatus,
  ReceivableWithBalance,
  AdjustmentType,
} from "@ir/types";
import type {
  NewAdjustmentRecord,
  NewReceiptRecord,
  NewReceivableRecord,
  ReceivableChanges,
  ReceivableListQuery,
  ReceivableRepository,
  ReversalInput,
} from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "receivables";
const VIEW = "receivables_with_balance";
const COLUMNS =
  "id, internal_reference, client_id, description, source_type, source_id, source_reference, subscription_id, contract_id, commercial_sale_id, installment_number, commitment_order_id, " +
  "original_amount, issue_date, due_date, competency_date, status, notes, created_at, updated_at";
const VIEW_COLUMNS = `${COLUMNS}, total_received, total_adjustments, balance`;

interface ReceivableRow {
  id: string;
  internal_reference: string;
  client_id: string;
  description: string;
  source_type: ReceivableSourceType;
  source_id: string | null;
  source_reference: string | null;
  subscription_id: string | null;
  contract_id: string | null;
  commercial_sale_id: string | null;
  installment_number: number | null;
  commitment_order_id: string | null;
  original_amount: number;
  issue_date: string;
  due_date: string;
  competency_date: string | null;
  status: ReceivableStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ReceivableWithBalanceRow extends ReceivableRow {
  total_received: number;
  total_adjustments: number;
  balance: number;
}

function toDomain(row: ReceivableRow): Receivable {
  return {
    id: row.id,
    reference: row.internal_reference,
    clientId: row.client_id,
    description: row.description,
    sourceType: row.source_type,
    sourceId: row.source_id ?? undefined,
    sourceReference: row.source_reference ?? undefined,
    subscriptionId: row.subscription_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    commercialSaleId: row.commercial_sale_id ?? undefined,
    installmentNumber: row.installment_number ?? undefined,
    commitmentOrderId: row.commitment_order_id ?? undefined,
    originalAmount: Number(row.original_amount),
    issueDate: row.issue_date,
    dueDate: row.due_date,
    competencyDate: row.competency_date ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDomainWithBalance(row: ReceivableWithBalanceRow): ReceivableWithBalance {
  return {
    ...toDomain(row),
    totalReceived: Number(row.total_received),
    totalAdjustments: Number(row.total_adjustments),
    balance: Number(row.balance),
  };
}

function toRow(record: NewReceivableRecord | ReceivableChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (record.clientId !== undefined) row.client_id = record.clientId;
  if (record.description !== undefined) row.description = record.description;
  if (record.sourceType !== undefined) row.source_type = record.sourceType;
  if (record.sourceId !== undefined) row.source_id = record.sourceId ?? null;
  if (record.sourceReference !== undefined) row.source_reference = record.sourceReference ?? null;
  if (record.subscriptionId !== undefined) row.subscription_id = record.subscriptionId ?? null;
  if (record.contractId !== undefined) row.contract_id = record.contractId ?? null;
  if (record.commercialSaleId !== undefined) row.commercial_sale_id = record.commercialSaleId ?? null;
  if (record.installmentNumber !== undefined) row.installment_number = record.installmentNumber ?? null;
  if (record.commitmentOrderId !== undefined) row.commitment_order_id = record.commitmentOrderId ?? null;
  if (record.originalAmount !== undefined) row.original_amount = record.originalAmount;
  if (record.issueDate !== undefined) row.issue_date = record.issueDate;
  if (record.dueDate !== undefined) row.due_date = record.dueDate;
  if (record.competencyDate !== undefined) row.competency_date = record.competencyDate ?? null;
  if (record.status !== undefined) row.status = record.status;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  return row;
}

const RECEIPT_COLUMNS =
  "id, receivable_id, amount, received_at, payment_method, reference, notes, received_by, recorded_by, " +
  "recorded_at, reversed_at, reversed_by, reversal_reason";

interface ReceiptRow {
  id: string;
  receivable_id: string;
  amount: number;
  received_at: string;
  payment_method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  received_by: string | null;
  recorded_by: string | null;
  recorded_at: string;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
}

function receiptToDomain(row: ReceiptRow): ReceivableReceipt {
  return {
    id: row.id,
    receivableId: row.receivable_id,
    amount: Number(row.amount),
    receivedAt: row.received_at,
    paymentMethod: row.payment_method ?? undefined,
    reference: row.reference ?? undefined,
    notes: row.notes ?? undefined,
    receivedByProfileId: row.received_by ?? undefined,
    recordedByProfileId: row.recorded_by ?? undefined,
    recordedAt: row.recorded_at,
    reversedAt: row.reversed_at ?? undefined,
    reversedByProfileId: row.reversed_by ?? undefined,
    reversalReason: row.reversal_reason ?? undefined,
  };
}

const ADJUSTMENT_COLUMNS =
  "id, receivable_id, amount, adjustment_type, reason, credit_id, authorized_by, recorded_by, recorded_at, notes, " +
  "reversed_at, reversed_by, reversal_reason";

interface AdjustmentRow {
  id: string;
  receivable_id: string;
  amount: number;
  adjustment_type: AdjustmentType;
  reason: string;
  credit_id: string | null;
  authorized_by: string | null;
  recorded_by: string | null;
  recorded_at: string;
  notes: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
}

function adjustmentToDomain(row: AdjustmentRow): ReceivableAdjustment {
  return {
    id: row.id,
    receivableId: row.receivable_id,
    amount: Number(row.amount),
    adjustmentType: row.adjustment_type,
    reason: row.reason,
    creditId: row.credit_id ?? undefined,
    authorizedByProfileId: row.authorized_by ?? undefined,
    recordedByProfileId: row.recorded_by ?? undefined,
    recordedAt: row.recorded_at,
    notes: row.notes ?? undefined,
    reversedAt: row.reversed_at ?? undefined,
    reversedByProfileId: row.reversed_by ?? undefined,
    reversalReason: row.reversal_reason ?? undefined,
  };
}

function matchesPreviewListQuery(receivable: ReceivableWithBalance, query?: ReceivableListQuery): boolean {
  if (!query) return true;
  if (query.clientId && receivable.clientId !== query.clientId) return false;
  if (query.contractId && receivable.contractId !== query.contractId) return false;
  if (query.subscriptionId && receivable.subscriptionId !== query.subscriptionId) return false;
  if (query.commercialSaleId && receivable.commercialSaleId !== query.commercialSaleId) return false;
  if (query.status && receivable.status !== query.status) return false;
  if (query.sourceType && receivable.sourceType !== query.sourceType) return false;
  return true;
}

export function createReceivableRepositorySupabase(client: SupabaseClient): ReceivableRepository {
  return {
    async list(query?: ReceivableListQuery) {
      // Faltava aqui (só listReceivablesAdminPageSupabase tinha o guard) —
      // a tela de detalhe de Assinaturas/Contratos chama este list() direto.
      if (isLocalPreviewEnabled()) return PREVIEW_RECEIVABLES.filter((r) => matchesPreviewListQuery(r, query));
      let builder = client.from(VIEW).select(VIEW_COLUMNS).order("due_date", { ascending: true });
      if (query?.clientId) builder = builder.eq("client_id", query.clientId);
      if (query?.contractId) builder = builder.eq("contract_id", query.contractId);
      if (query?.subscriptionId) builder = builder.eq("subscription_id", query.subscriptionId);
      if (query?.commercialSaleId) builder = builder.eq("commercial_sale_id", query.commercialSaleId);
      if (query?.status) builder = builder.eq("status", query.status);
      if (query?.sourceType) builder = builder.eq("source_type", query.sourceType);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomainWithBalance(row as unknown as ReceivableWithBalanceRow));
    },

    async getById(id) {
      if (isLocalPreviewEnabled()) return PREVIEW_RECEIVABLES.find((r) => r.id === id) ?? null;
      const { data, error } = await client.from(VIEW).select(VIEW_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomainWithBalance(data as unknown as ReceivableWithBalanceRow) : null;
    },

    async findBySubscriptionAndCompetency(subscriptionId, competencyDate) {
      if (isLocalPreviewEnabled()) {
        return PREVIEW_RECEIVABLES.find((r) => r.subscriptionId === subscriptionId && r.competencyDate === competencyDate) ?? null;
      }
      const { data, error } = await client
        .from(TABLE)
        .select(COLUMNS)
        .eq("subscription_id", subscriptionId)
        .eq("competency_date", competencyDate)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as ReceivableRow) : null;
    },

    async findByCommercialSaleAndInstallment(commercialSaleId, installmentNumber) {
      if (isLocalPreviewEnabled()) {
        return PREVIEW_RECEIVABLES.find((r) => r.commercialSaleId === commercialSaleId && r.installmentNumber === installmentNumber) ?? null;
      }
      const { data, error } = await client
        .from(TABLE)
        .select(COLUMNS)
        .eq("commercial_sale_id", commercialSaleId)
        .eq("installment_number", installmentNumber)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as ReceivableRow) : null;
    },

    async listOpenForOrigin(query) {
      if (isLocalPreviewEnabled()) {
        return PREVIEW_RECEIVABLES.filter(
          (r) =>
            r.clientId === query.clientId &&
            r.sourceType === query.sourceType &&
            (r.status === "open" || r.status === "partially_paid") &&
            (!query.subscriptionId || r.subscriptionId === query.subscriptionId) &&
            (!query.contractId || r.contractId === query.contractId) &&
            (!query.excludeId || r.id !== query.excludeId),
        );
      }
      let builder = client
        .from(VIEW)
        .select(VIEW_COLUMNS)
        .eq("client_id", query.clientId)
        .eq("source_type", query.sourceType)
        .in("status", ["open", "partially_paid"])
        .order("due_date", { ascending: true });
      if (query.subscriptionId) builder = builder.eq("subscription_id", query.subscriptionId);
      if (query.contractId) builder = builder.eq("contract_id", query.contractId);
      if (query.excludeId) builder = builder.neq("id", query.excludeId);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomainWithBalance(row as unknown as ReceivableWithBalanceRow));
    },

    async create(record) {
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) {
        if (error.message.includes("receivables_subscription_competency_unique")) {
          throw new Error("receivables_subscription_competency_unique");
        }
        if (error.message.includes("receivables_commercial_sale_installment_unique")) {
          throw new Error("receivables_commercial_sale_installment_unique");
        }
        throw new Error(error.message);
      }
      return toDomain(data as unknown as ReceivableRow);
    },

    async update(id, changes) {
      const { data, error } = await client.from(TABLE).update(toRow(changes)).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as ReceivableRow);
    },

    async listReceipts(receivableId) {
      if (isLocalPreviewEnabled()) return PREVIEW_RECEIPTS.filter((r) => r.receivableId === receivableId);
      const { data, error } = await client
        .from("receivable_receipts")
        .select(RECEIPT_COLUMNS)
        .eq("receivable_id", receivableId)
        .order("received_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => receiptToDomain(row as unknown as ReceiptRow));
    },

    async addReceipt(record: NewReceiptRecord) {
      const { data, error } = await client
        .from("receivable_receipts")
        .insert({
          receivable_id: record.receivableId,
          amount: record.amount,
          received_at: record.receivedAt,
          payment_method: record.paymentMethod ?? null,
          reference: record.reference ?? null,
          notes: record.notes ?? null,
          received_by: record.receivedByProfileId ?? null,
        })
        .select(RECEIPT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return receiptToDomain(data as unknown as ReceiptRow);
    },

    async reverseReceipt(id, reversal: ReversalInput) {
      const { data, error } = await client
        .from("receivable_receipts")
        .update({
          reversed_at: new Date().toISOString(),
          reversed_by: reversal.reversedByProfileId,
          reversal_reason: reversal.reversalReason,
        })
        .eq("id", id)
        .select(RECEIPT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return receiptToDomain(data as unknown as ReceiptRow);
    },

    async listAdjustments(receivableId) {
      if (isLocalPreviewEnabled()) return [];
      const { data, error } = await client
        .from("receivable_adjustments")
        .select(ADJUSTMENT_COLUMNS)
        .eq("receivable_id", receivableId)
        .order("recorded_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => adjustmentToDomain(row as unknown as AdjustmentRow));
    },

    async addAdjustment(record: NewAdjustmentRecord) {
      const { data, error } = await client
        .from("receivable_adjustments")
        .insert({
          receivable_id: record.receivableId,
          amount: record.amount,
          adjustment_type: record.adjustmentType,
          reason: record.reason,
          credit_id: record.creditId ?? null,
          authorized_by: record.authorizedByProfileId ?? null,
          notes: record.notes ?? null,
        })
        .select(ADJUSTMENT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return adjustmentToDomain(data as unknown as AdjustmentRow);
    },

    async reverseAdjustment(id, reversal: ReversalInput) {
      const { data, error } = await client
        .from("receivable_adjustments")
        .update({
          reversed_at: new Date().toISOString(),
          reversed_by: reversal.reversedByProfileId,
          reversal_reason: reversal.reversalReason,
        })
        .eq("id", id)
        .select(ADJUSTMENT_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return adjustmentToDomain(data as unknown as AdjustmentRow);
    },
  };
}

export interface ReceivableAdminPageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ReceivableStatus;
  sourceType?: ReceivableSourceType;
  clientId?: string;
  contractId?: string;
  subscriptionId?: string;
  dueFrom?: string;
  dueTo?: string;
  competencyFrom?: string;
  competencyTo?: string;
  /** "Quem recebeu" e "quem registrou" continuam conceitos diferentes — nunca o mesmo filtro. */
  receivedByProfileId?: string;
  recordedByProfileId?: string;
  paymentMethod?: PaymentMethod;
  /** Quitado (status=paid) especificamente via "Quitar com diferença" (tem ao menos um abatimento adjustment_type=settlement_difference válido). */
  settledWithDifferenceOnly?: boolean;
  /** Só títulos com saldo > 0 (em aberto ou parcial, nunca quitado/cancelado). */
  withBalanceOnly?: boolean;
  /** Só títulos com status=partially_paid. */
  partiallyPaidOnly?: boolean;
}

export interface ReceivableListItem extends ReceivableWithBalance {
  clientName: string;
}

export interface ReceivableAdminPageResult {
  receivables: ReceivableListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function receivablePageSize(value?: number): number {
  return value === 25 || value === 50 || value === 100 ? value : 25;
}

// Variedade suficiente pra demonstrar status/origem/PF-PJ sem depender do
// Supabase remoto (ver relatório da tarefa de Financeiro): REC-000001
// avulso aberto e vencido; REC-000002 de assinatura, quitado; REC-000003
// de assinatura, parcialmente pago (saldo > 0, ver PREVIEW_RECEIPTS);
// REC-000004 de contrato institucional (PJ), aberto e a vencer.
// Exportados pra financialOverview.supabase.ts recalcular os KPIs do
// dashboard a partir dos MESMOS registros (nunca número fixo independente).
export const PREVIEW_RECEIVABLES: ReceivableListItem[] = [
  {
    id: "preview-titulo-1",
    reference: "REC-000001",
    clientId: "preview-cliente-1",
    description: "Título de exemplo (visualização local)",
    sourceType: "miscellaneous",
    originalAmount: 500,
    issueDate: "2026-01-01",
    dueDate: "2026-02-01",
    status: "open",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    totalReceived: 0,
    totalAdjustments: 0,
    balance: 500,
    clientName: "Cliente de Exemplo (visualização local)",
  },
  {
    id: "preview-titulo-2",
    reference: "REC-000002",
    clientId: "preview-cliente-1",
    description: "Assinatura Digital · Mensal — competência 2026-09",
    sourceType: "subscription",
    subscriptionId: "preview-assinatura-1",
    originalAmount: 29.9,
    issueDate: "2026-09-01",
    dueDate: "2026-09-10",
    competencyDate: "2026-09-01",
    status: "paid",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    totalReceived: 29.9,
    totalAdjustments: 0,
    balance: 0,
    clientName: "Cliente de Exemplo (visualização local)",
  },
  {
    id: "preview-titulo-3",
    reference: "REC-000003",
    clientId: "preview-cliente-1",
    description: "Assinatura Impresso · Anual — competência 2026",
    sourceType: "subscription",
    subscriptionId: "preview-assinatura-2",
    originalAmount: 49.9,
    issueDate: "2026-01-05",
    dueDate: "2026-01-05",
    competencyDate: "2026-01-01",
    status: "partially_paid",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    totalReceived: 20,
    totalAdjustments: 0,
    balance: 29.9,
    clientName: "Cliente de Exemplo (visualização local)",
  },
  {
    id: "preview-titulo-4",
    reference: "REC-000004",
    clientId: "preview-cliente-2",
    description: "Contrato CTR-000001 — parcela 1/12",
    sourceType: "institutional_contract",
    contractId: "preview-contrato-1",
    originalAmount: 100,
    issueDate: "2026-10-01",
    dueDate: "2026-11-10",
    status: "open",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    totalReceived: 0,
    totalAdjustments: 0,
    balance: 100,
    clientName: "Empresa de Exemplo Ltda. (visualização local)",
  },
  // Cenário demonstrativo de excedente de Pix (ver relatório da tarefa
  // "confirmação de Pix quando o saldo mudou"): título de R$ 500, já com
  // R$ 200 pagos em dinheiro (saldo R$ 300) — e uma cobrança Pix PENDENTE
  // de R$ 500 (ver previewCharges em paymentChargeRepository.supabase.ts),
  // criada ANTES do pagamento em dinheiro. Ao confirmar o Pix, só R$ 300
  // são aplicados como receipt (nunca os R$ 500 inteiros sobre um saldo
  // de R$ 300) e os R$ 200 excedentes viram crédito do cliente.
  {
    id: "preview-titulo-5",
    reference: "REC-000005",
    clientId: "preview-cliente-1",
    description: "Lançamento avulso — demonstração de excedente de Pix",
    sourceType: "miscellaneous",
    originalAmount: 500,
    issueDate: "2026-10-01",
    dueDate: "2026-10-20",
    status: "partially_paid",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    totalReceived: 200,
    totalAdjustments: 0,
    balance: 300,
    clientName: "Cliente de Exemplo (visualização local)",
  },
  // Cenários do módulo Comercial/Publicidade (ver commercialSaleRepository.supabase.ts
  // — preview-venda-1/2/3/4): REC-000006 em aberto (venda ativa, PF);
  // REC-000007 quitado (venda concluída, PJ); REC-000008 em aberto mas
  // negociada como permuta (commercial_condition='trade' na venda —
  // nunca confundir com payment_method, que só muda quando este título
  // for de fato liquidado).
  {
    id: "preview-titulo-com-1",
    reference: "REC-000006",
    clientId: "preview-cliente-1",
    description: "Venda IR-COM-2026-000001 — parcela 1/2",
    sourceType: "advertising",
    commercialSaleId: "preview-venda-1",
    installmentNumber: 1,
    originalAmount: 300,
    issueDate: "2026-10-01",
    dueDate: "2026-10-15",
    status: "open",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    totalReceived: 0,
    totalAdjustments: 0,
    balance: 300,
    clientName: "Cliente de Exemplo (visualização local)",
  },
  {
    id: "preview-titulo-com-2",
    reference: "REC-000007",
    clientId: "preview-cliente-2",
    description: "Venda IR-COM-2026-000002",
    sourceType: "advertising",
    commercialSaleId: "preview-venda-2",
    installmentNumber: 1,
    originalAmount: 1200,
    issueDate: "2026-09-01",
    dueDate: "2026-09-10",
    status: "paid",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    totalReceived: 1200,
    totalAdjustments: 0,
    balance: 0,
    clientName: "Empresa de Exemplo Ltda. (visualização local)",
  },
  {
    id: "preview-titulo-com-3",
    reference: "REC-000008",
    clientId: "preview-cliente-2",
    description: "Venda IR-COM-2026-000003",
    sourceType: "advertising",
    commercialSaleId: "preview-venda-3",
    installmentNumber: 1,
    originalAmount: 450,
    issueDate: "2026-10-01",
    dueDate: "2026-10-30",
    status: "open",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    totalReceived: 0,
    totalAdjustments: 0,
    balance: 450,
    clientName: "Empresa de Exemplo Ltda. (visualização local)",
  },
  // REC-000009 — título da venda comercial preview-venda-6, JÁ PAGO antes
  // de a venda ser cancelada. Demonstra que cancelar a venda (status=
  // cancelled em commercial_sales) nunca apaga/altera o título ou o
  // recebimento já registrado — histórico financeiro preservado.
  {
    id: "preview-titulo-com-4",
    reference: "REC-000009",
    clientId: "preview-cliente-2",
    description: "Venda IR-COM-2026-000006",
    sourceType: "advertising",
    commercialSaleId: "preview-venda-6",
    installmentNumber: 1,
    originalAmount: 300,
    issueDate: "2026-08-01",
    dueDate: "2026-08-10",
    status: "paid",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    totalReceived: 300,
    totalAdjustments: 0,
    balance: 0,
    clientName: "Empresa de Exemplo Ltda. (visualização local)",
  },
];

export const PREVIEW_RECEIPTS: ReceivableReceipt[] = [
  {
    id: "preview-recebimento-1",
    receivableId: "preview-titulo-2",
    amount: 29.9,
    receivedAt: "2026-09-08T10:00:00.000Z",
    paymentMethod: "pix",
    recordedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-recebimento-2",
    receivableId: "preview-titulo-3",
    amount: 20,
    receivedAt: "2026-01-04T10:00:00.000Z",
    paymentMethod: "cash",
    recordedAt: new Date(0).toISOString(),
  },
  // Pagamento manual em dinheiro registrado DEPOIS da cobrança Pix pendente
  // de preview-titulo-5 ter sido criada — ver nota no fixture do título.
  {
    id: "preview-recebimento-3",
    receivableId: "preview-titulo-5",
    amount: 200,
    receivedAt: "2026-10-12T10:00:00.000Z",
    paymentMethod: "cash",
    recordedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-recebimento-com-1",
    receivableId: "preview-titulo-com-2",
    amount: 1200,
    receivedAt: "2026-09-09T10:00:00.000Z",
    paymentMethod: "pix",
    recordedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-recebimento-com-2",
    receivableId: "preview-titulo-com-4",
    amount: 300,
    receivedAt: "2026-08-05T10:00:00.000Z",
    paymentMethod: "pix",
    recordedAt: new Date(0).toISOString(),
  },
  // Recibo CANCELADO (estornado) — demonstra o filtro "cancelados" na
  // tela de Recibos (Financeiro). preview-titulo-1 continua mostrando
  // totalReceived=0/status=open (valor estático do fixture do título) —
  // coerente: o único recebimento que ele teve foi estornado.
  {
    id: "preview-recebimento-4",
    receivableId: "preview-titulo-1",
    amount: 500,
    receivedAt: "2026-01-15T10:00:00.000Z",
    paymentMethod: "cash",
    recordedAt: new Date(0).toISOString(),
    reversedAt: "2026-01-16T09:00:00.000Z",
    reversalReason: "Pagamento registrado em duplicidade (demonstração).",
  },
];

interface ReceivableRowWithClient extends ReceivableWithBalanceRow {
  clients: {
    kind: "individual" | "company";
    full_name: string | null;
    company_name: string | null;
    trade_name: string | null;
  } | null;
}

function toListItem(row: ReceivableRowWithClient): ReceivableListItem {
  const clientName =
    row.clients?.kind === "company"
      ? row.clients.trade_name || row.clients.company_name || "(sem nome)"
      : row.clients?.full_name || "(sem nome)";
  return { ...toDomainWithBalance(row), clientName };
}

const LIST_VIEW_COLUMNS = `${VIEW_COLUMNS}, clients(kind, full_name, company_name, trade_name)`;

/** Mesmo princípio de findMatchingClientIds em Assinaturas — nunca um
 * `.or()` cruzando a view e o embed `clients(...)`. */
async function findMatchingClientIds(client: SupabaseClient, term: string): Promise<string[]> {
  const pattern = `%${term}%`;
  const digits = term.replace(/\D+/g, "");
  const ors = [`full_name.ilike.${pattern}`, `company_name.ilike.${pattern}`, `trade_name.ilike.${pattern}`];
  if (digits) ors.push(`cpf.ilike.%${digits}%`, `cnpj.ilike.%${digits}%`);
  const { data, error } = await client.from("clients").select("id").or(ors.join(","));
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => (row as { id: string }).id);
}

/**
 * Resolve quais `receivable_id` têm ao menos um recebimento válido
 * (não estornado) batendo com os filtros de "quem recebeu"/"quem
 * registrou"/forma de pagamento — nunca confundidos entre si, mesmo
 * princípio de findMatchingClientIds (consulta própria de uma tabela
 * só, nunca um filtro cruzando a view com receivable_receipts). `null`
 * significa "nenhum filtro deste grupo ativo" (não restringe nada).
 */
async function findReceivableIdsByReceiptFilters(
  client: SupabaseClient,
  filters: { receivedByProfileId?: string; recordedByProfileId?: string; paymentMethod?: PaymentMethod },
): Promise<string[] | null> {
  if (!filters.receivedByProfileId && !filters.recordedByProfileId && !filters.paymentMethod) return null;
  let query = client.from("receivable_receipts").select("receivable_id").is("reversed_at", null);
  if (filters.receivedByProfileId) query = query.eq("received_by", filters.receivedByProfileId);
  if (filters.recordedByProfileId) query = query.eq("recorded_by", filters.recordedByProfileId);
  if (filters.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => (row as { receivable_id: string }).receivable_id))];
}

/** Títulos com ao menos um abatimento válido (não estornado) do tipo
 * settlement_difference — "quitado com abatimento" (Parte 3B, item 10). */
async function findReceivableIdsSettledWithDifference(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client
    .from("receivable_adjustments")
    .select("receivable_id")
    .is("reversed_at", null)
    .eq("adjustment_type", "settlement_difference");
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => (row as { receivable_id: string }).receivable_id))];
}

/**
 * Lista paginada da tela de Contas a Receber — busca por referência/
 * descrição do título OU nome/razão social/CPF/CNPJ do cliente
 * (resolvido via findMatchingClientIds + `client_id.in.(...)`, mesmo
 * princípio do módulo Assinaturas). Filtros de status/origem/cliente/
 * contrato/vencimento/quem recebeu/quem registrou/forma de pagamento
 * rodam no banco (os três últimos via findReceivableIdsByReceiptFilters,
 * já que vivem em receivable_receipts, não em receivables). Usa a view
 * com saldo já calculado.
 */
export async function listReceivablesAdminPageSupabase(
  client: SupabaseClient,
  input: ReceivableAdminPageQuery = {},
): Promise<ReceivableAdminPageResult> {
  if (isLocalPreviewEnabled()) {
    return { receivables: PREVIEW_RECEIVABLES, total: PREVIEW_RECEIVABLES.length, page: 1, pageSize: receivablePageSize(input.pageSize), totalPages: 1 };
  }
  const pageSize = receivablePageSize(input.pageSize);
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));

  const term = (input.search ?? "").trim().replace(/[%_,]/g, " ");
  const matchingClientIds = term ? await findMatchingClientIds(client, term) : [];
  const receiptFilteredIds = await findReceivableIdsByReceiptFilters(client, {
    receivedByProfileId: input.receivedByProfileId,
    recordedByProfileId: input.recordedByProfileId,
    paymentMethod: input.paymentMethod,
  });
  const settledWithDifferenceIds = input.settledWithDifferenceOnly ? await findReceivableIdsSettledWithDifference(client) : null;

  const build = (page: number) => {
    let query = client.from(VIEW).select(LIST_VIEW_COLUMNS, { count: "exact" }).order("due_date", { ascending: true }).order("id", { ascending: true });

    if (input.status) query = query.eq("status", input.status);
    if (input.partiallyPaidOnly) query = query.eq("status", "partially_paid");
    if (input.sourceType) query = query.eq("source_type", input.sourceType);
    if (input.clientId) query = query.eq("client_id", input.clientId);
    if (input.contractId) query = query.eq("contract_id", input.contractId);
    if (input.subscriptionId) query = query.eq("subscription_id", input.subscriptionId);
    if (input.dueFrom) query = query.gte("due_date", input.dueFrom);
    if (input.dueTo) query = query.lte("due_date", input.dueTo);
    if (input.competencyFrom) query = query.gte("competency_date", input.competencyFrom);
    if (input.competencyTo) query = query.lte("competency_date", input.competencyTo);
    if (input.withBalanceOnly) query = query.gt("balance", 0);
    if (receiptFilteredIds !== null) {
      query = query.in("id", receiptFilteredIds.length > 0 ? receiptFilteredIds : ["00000000-0000-0000-0000-000000000000"]);
    }
    if (settledWithDifferenceIds !== null) {
      query = query.in("id", settledWithDifferenceIds.length > 0 ? settledWithDifferenceIds : ["00000000-0000-0000-0000-000000000000"]);
    }

    if (term) {
      const ors = [`internal_reference.ilike.%${term}%`, `description.ilike.%${term}%`];
      if (matchingClientIds.length > 0) ors.push(`client_id.in.(${matchingClientIds.join(",")})`);
      query = query.or(ors.join(","));
    }

    const from = (page - 1) * pageSize;
    return query.range(from, from + pageSize - 1);
  };

  let { data, error, count } = await build(requestedPage);
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage) {
    const retry = await build(page);
    if (retry.error) throw new Error(retry.error.message);
    data = retry.data;
  }

  return {
    receivables: (data ?? []).map((row) => toListItem(row as unknown as ReceivableRowWithClient)),
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Relatórios/exportações: varre todas as páginas REAIS, porque o paginador
 * público limita pageSize a 100. Pedir pageSize:1000 silenciosamente
 * retornava só 25 lançamentos e produzia CSV, impressão e totais errados.
 * Em volumes excepcionais falha explicitamente em vez de truncar dados.
 */
export async function listAllReceivablesForReportSupabase(
  client: SupabaseClient,
  filters: Omit<ReceivableAdminPageQuery, "page" | "pageSize"> = {},
): Promise<{ receivables: ReceivableListItem[]; total: number }> {
  const first = await listReceivablesAdminPageSupabase(client, { ...filters, page: 1, pageSize: 100 });
  const all = [...first.receivables];
  if (first.total > 10000) {
    throw new Error("O relatório possui mais de 10.000 títulos. Reduza o período ou os filtros antes de exportar.");
  }
  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await listReceivablesAdminPageSupabase(client, { ...filters, page, pageSize: 100 });
    if (result.total !== first.total || result.page !== page) {
      throw new Error("Os lançamentos mudaram durante a geração do relatório. Recarregue e tente novamente.");
    }
    all.push(...result.receivables);
  }
  if (all.length !== first.total) {
    throw new Error("Relatório incompleto: a quantidade de títulos mudou. Tente novamente.");
  }
  return { receivables: all, total: first.total };
}

/** Títulos de VÁRIOS contratos de uma vez (Bloco 2, item 10 — relatório
 * de contratos) — evita N+1 ao montar o resumo de cada contrato na
 * listagem. Agrupar por contractId é responsabilidade de quem chama. */
export async function listReceivablesForContractsSupabase(client: SupabaseClient, contractIds: string[]): Promise<ReceivableWithBalance[]> {
  if (contractIds.length === 0) return [];
  if (isLocalPreviewEnabled()) return PREVIEW_RECEIVABLES.filter((r) => r.contractId && contractIds.includes(r.contractId));
  const { data, error } = await client.from(VIEW).select(VIEW_COLUMNS).in("contract_id", contractIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toDomainWithBalance(row as unknown as ReceivableWithBalanceRow));
}

/** Títulos de VÁRIAS vendas comerciais de uma vez — evita N+1 ao montar
 * a situação financeira de cada venda na listagem do Comercial (mesmo
 * princípio de listReceivablesForContractsSupabase). */
export async function listReceivablesForCommercialSalesSupabase(client: SupabaseClient, commercialSaleIds: string[]): Promise<ReceivableWithBalance[]> {
  if (commercialSaleIds.length === 0) return [];
  if (isLocalPreviewEnabled()) return PREVIEW_RECEIVABLES.filter((r) => r.commercialSaleId && commercialSaleIds.includes(r.commercialSaleId));
  const { data, error } = await client.from(VIEW).select(VIEW_COLUMNS).in("commercial_sale_id", commercialSaleIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toDomainWithBalance(row as unknown as ReceivableWithBalanceRow));
}

/**
 * Quanto do total "Descontos/abatimentos" de um conjunto de títulos é
 * na verdade crédito aplicado (Parte 3B.1, item 18 — "não tratar
 * crédito aplicado como novo dinheiro recebido" / nunca misturar com
 * desconto de verdade nos relatórios). Só soma aplicações válidas.
 */
export async function sumCreditAppliedForReceivables(client: SupabaseClient, receivableIds: string[]): Promise<number> {
  if (receivableIds.length === 0 || isLocalPreviewEnabled()) return 0;
  let total = 0;
  // Evita limites de tamanho no filtro "in" para relatórios grandes.
  for (let index = 0; index < receivableIds.length; index += 100) {
    const batch = receivableIds.slice(index, index + 100);
    const { data, error } = await client
      .from("receivable_adjustments")
      .select("amount")
      .in("receivable_id", batch)
      .eq("adjustment_type", "credit_applied")
      .is("reversed_at", null);
    if (error) throw new Error(error.message);
    total += (data ?? []).reduce((sum, row) => sum + Number((row as { amount: number }).amount), 0);
  }
  return total;
}

/** Contexto do título mostrado nas linhas dos relatórios de Recebimentos/
 * Abatimentos — nunca uma FK de domínio, só dados pra exibição. */
export interface ReceivableReceiptListItem extends ReceivableReceipt {
  receivableReference: string;
  receivableDescription: string;
  sourceType: ReceivableSourceType;
  contractId?: string;
  clientId: string;
  clientName: string;
}

export interface ReceivableAdjustmentListItem extends ReceivableAdjustment {
  receivableReference: string;
  receivableDescription: string;
  sourceType: ReceivableSourceType;
  contractId?: string;
  clientId: string;
  clientName: string;
}

interface EmbeddedReceivable {
  internal_reference: string;
  description: string;
  source_type: ReceivableSourceType;
  contract_id: string | null;
  client_id: string;
  clients: { kind: "individual" | "company"; full_name: string | null; company_name: string | null; trade_name: string | null } | null;
}

function embeddedClientName(embedded: EmbeddedReceivable): string {
  return embedded.clients?.kind === "company"
    ? embedded.clients.trade_name || embedded.clients.company_name || "(sem nome)"
    : embedded.clients?.full_name || "(sem nome)";
}

/** Resolve quais `receivable.id` batem com cliente/contrato/origem — mesmo
 * princípio de findMatchingClientIds: nunca um filtro cruzando tabelas
 * diferentes num só `.or()`. `null` significa "nenhum filtro deste grupo". */
async function findReceivableIdsByTitleFilters(
  client: SupabaseClient,
  filters: { clientId?: string; contractId?: string; sourceType?: ReceivableSourceType },
): Promise<string[] | null> {
  if (!filters.clientId && !filters.contractId && !filters.sourceType) return null;
  let query = client.from(TABLE).select("id");
  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.contractId) query = query.eq("contract_id", filters.contractId);
  if (filters.sourceType) query = query.eq("source_type", filters.sourceType);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => (row as { id: string }).id);
}

export interface ReceiptReportQuery {
  page?: number;
  pageSize?: number;
  clientId?: string;
  contractId?: string;
  sourceType?: ReceivableSourceType;
  receivedFrom?: string;
  receivedTo?: string;
  receivedByProfileId?: string;
  recordedByProfileId?: string;
  paymentMethod?: PaymentMethod;
}

export interface ReceiptReportResult {
  receipts: ReceivableReceiptListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const RECEIPT_REPORT_COLUMNS = `${RECEIPT_COLUMNS}, receivables(internal_reference, description, source_type, contract_id, client_id, clients(kind, full_name, company_name, trade_name))`;

/**
 * Relatório de Recebimentos (Parte 3B, item 12) — uma linha por
 * recebimento VÁLIDO (nunca estornado). Filtros de cliente/contrato/
 * origem resolvidos primeiro contra `receivables` (findReceivableIdsByTitleFilters),
 * nunca um `.or()` cruzando receivable_receipts com receivables.
 */
export async function listReceivableReceiptsReportSupabase(
  client: SupabaseClient,
  input: ReceiptReportQuery = {},
): Promise<ReceiptReportResult> {
  if (isLocalPreviewEnabled()) return { receipts: [], total: 0, page: 1, pageSize: receivablePageSize(input.pageSize), totalPages: 1 };
  const pageSize = receivablePageSize(input.pageSize);
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));
  const titleFilteredIds = await findReceivableIdsByTitleFilters(client, {
    clientId: input.clientId,
    contractId: input.contractId,
    sourceType: input.sourceType,
  });

  const build = (page: number) => {
    let query = client
      .from("receivable_receipts")
      .select(RECEIPT_REPORT_COLUMNS, { count: "exact" })
      .is("reversed_at", null)
      .order("received_at", { ascending: false });
    if (titleFilteredIds !== null) {
      query = query.in("receivable_id", titleFilteredIds.length > 0 ? titleFilteredIds : ["00000000-0000-0000-0000-000000000000"]);
    }
    if (input.receivedFrom) query = query.gte("received_at", input.receivedFrom);
    if (input.receivedTo) query = query.lte("received_at", `${input.receivedTo}T23:59:59`);
    if (input.receivedByProfileId) query = query.eq("received_by", input.receivedByProfileId);
    if (input.recordedByProfileId) query = query.eq("recorded_by", input.recordedByProfileId);
    if (input.paymentMethod) query = query.eq("payment_method", input.paymentMethod);
    const from = (page - 1) * pageSize;
    return query.range(from, from + pageSize - 1);
  };

  let { data, error, count } = await build(requestedPage);
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage) {
    const retry = await build(page);
    if (retry.error) throw new Error(retry.error.message);
    data = retry.data;
  }

  const receipts = (data ?? []).map((row) => {
    const typed = row as unknown as ReceiptRow & { receivables: EmbeddedReceivable | null };
    const embedded = typed.receivables;
    return {
      ...receiptToDomain(typed),
      receivableReference: embedded?.internal_reference ?? "—",
      receivableDescription: embedded?.description ?? "—",
      sourceType: embedded?.source_type ?? "miscellaneous",
      contractId: embedded?.contract_id ?? undefined,
      clientId: embedded?.client_id ?? "",
      clientName: embedded ? embeddedClientName(embedded) : "—",
    } satisfies ReceivableReceiptListItem;
  });

  return { receipts, total, page, pageSize, totalPages };
}

export type ReceiptRecordStatus = "active" | "cancelled" | "all";

export interface RecibosQuery {
  status?: ReceiptRecordStatus;
  page?: number;
  pageSize?: number;
  clientId?: string;
}

export interface RecibosResult {
  receipts: ReceivableReceiptListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Financeiro > Recibos (Fase 7) — lista TODOS os recebimentos (ativos e
 * cancelados/estornados, conforme filtro), nunca só os válidos como o
 * relatório de Recebimentos (listReceivableReceiptsReportSupabase, que
 * permanece intocado). "cancelado" aqui é o mesmo conceito já existente
 * de reversed_at — nenhuma tabela/coluna nova.
 */
export async function listReceiptsForRecibosSupabase(client: SupabaseClient, input: RecibosQuery = {}): Promise<RecibosResult> {
  const pageSize = receivablePageSize(input.pageSize);
  const status = input.status ?? "active";

  if (isLocalPreviewEnabled()) {
    const receivableById = new Map(PREVIEW_RECEIVABLES.map((r) => [r.id, r]));
    let receipts = PREVIEW_RECEIPTS.filter((receipt) => {
      if (status === "active") return !receipt.reversedAt;
      if (status === "cancelled") return Boolean(receipt.reversedAt);
      return true;
    });
    if (input.clientId) {
      receipts = receipts.filter((receipt) => receivableById.get(receipt.receivableId)?.clientId === input.clientId);
    }
    receipts.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
    const items = receipts.map((receipt) => {
      const receivable = receivableById.get(receipt.receivableId);
      return {
        ...receipt,
        receivableReference: receivable?.reference ?? "—",
        receivableDescription: receivable?.description ?? "—",
        sourceType: receivable?.sourceType ?? "miscellaneous",
        contractId: receivable?.contractId,
        clientId: receivable?.clientId ?? "",
        clientName: receivable?.clientName ?? "—",
      } satisfies ReceivableReceiptListItem;
    });
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), totalPages);
    const from = (page - 1) * pageSize;
    return { receipts: items.slice(from, from + pageSize), total, page, pageSize, totalPages };
  }

  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));
  const titleFilteredIds = input.clientId ? await findReceivableIdsByTitleFilters(client, { clientId: input.clientId }) : null;

  const build = (page: number) => {
    let query = client
      .from("receivable_receipts")
      .select(RECEIPT_REPORT_COLUMNS, { count: "exact" })
      .order("received_at", { ascending: false });
    if (status === "active") query = query.is("reversed_at", null);
    if (status === "cancelled") query = query.not("reversed_at", "is", null);
    if (titleFilteredIds !== null) {
      query = query.in("receivable_id", titleFilteredIds.length > 0 ? titleFilteredIds : ["00000000-0000-0000-0000-000000000000"]);
    }
    const from = (page - 1) * pageSize;
    return query.range(from, from + pageSize - 1);
  };

  let { data, error, count } = await build(requestedPage);
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage) {
    const retry = await build(page);
    if (retry.error) throw new Error(retry.error.message);
    data = retry.data;
  }

  const receipts = (data ?? []).map((row) => {
    const typed = row as unknown as ReceiptRow & { receivables: EmbeddedReceivable | null };
    const embedded = typed.receivables;
    return {
      ...receiptToDomain(typed),
      receivableReference: embedded?.internal_reference ?? "—",
      receivableDescription: embedded?.description ?? "—",
      sourceType: embedded?.source_type ?? "miscellaneous",
      contractId: embedded?.contract_id ?? undefined,
      clientId: embedded?.client_id ?? "",
      clientName: embedded ? embeddedClientName(embedded) : "—",
    } satisfies ReceivableReceiptListItem;
  });

  return { receipts, total, page, pageSize, totalPages };
}

export interface AdjustmentReportQuery {
  page?: number;
  pageSize?: number;
  clientId?: string;
  contractId?: string;
  recordedByProfileId?: string;
  recordedFrom?: string;
  recordedTo?: string;
}

export interface AdjustmentReportResult {
  adjustments: ReceivableAdjustmentListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ADJUSTMENT_REPORT_COLUMNS = `${ADJUSTMENT_COLUMNS}, receivables(internal_reference, description, source_type, contract_id, client_id, clients(kind, full_name, company_name, trade_name))`;

/**
 * Relatório de Abatimentos (Parte 3B, item 13) — uma linha por abatimento
 * VÁLIDO (nunca estornado). Mesmo princípio de resolução de filtros do
 * relatório de Recebimentos.
 */
export async function listReceivableAdjustmentsReportSupabase(
  client: SupabaseClient,
  input: AdjustmentReportQuery = {},
): Promise<AdjustmentReportResult> {
  if (isLocalPreviewEnabled()) return { adjustments: [], total: 0, page: 1, pageSize: receivablePageSize(input.pageSize), totalPages: 1 };
  const pageSize = receivablePageSize(input.pageSize);
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));
  const titleFilteredIds = await findReceivableIdsByTitleFilters(client, {
    clientId: input.clientId,
    contractId: input.contractId,
  });

  const build = (page: number) => {
    let query = client
      .from("receivable_adjustments")
      .select(ADJUSTMENT_REPORT_COLUMNS, { count: "exact" })
      .is("reversed_at", null)
      .order("recorded_at", { ascending: false });
    if (titleFilteredIds !== null) {
      query = query.in("receivable_id", titleFilteredIds.length > 0 ? titleFilteredIds : ["00000000-0000-0000-0000-000000000000"]);
    }
    if (input.recordedFrom) query = query.gte("recorded_at", input.recordedFrom);
    if (input.recordedTo) query = query.lte("recorded_at", `${input.recordedTo}T23:59:59`);
    if (input.recordedByProfileId) query = query.eq("recorded_by", input.recordedByProfileId);
    const from = (page - 1) * pageSize;
    return query.range(from, from + pageSize - 1);
  };

  let { data, error, count } = await build(requestedPage);
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage) {
    const retry = await build(page);
    if (retry.error) throw new Error(retry.error.message);
    data = retry.data;
  }

  const adjustments = (data ?? []).map((row) => {
    const typed = row as unknown as AdjustmentRow & { receivables: EmbeddedReceivable | null };
    const embedded = typed.receivables;
    return {
      ...adjustmentToDomain(typed),
      receivableReference: embedded?.internal_reference ?? "—",
      receivableDescription: embedded?.description ?? "—",
      sourceType: embedded?.source_type ?? "miscellaneous",
      contractId: embedded?.contract_id ?? undefined,
      clientId: embedded?.client_id ?? "",
      clientName: embedded ? embeddedClientName(embedded) : "—",
    } satisfies ReceivableAdjustmentListItem;
  });

  return { adjustments, total, page, pageSize, totalPages };
}
