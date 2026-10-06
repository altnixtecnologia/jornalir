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

const TABLE = "receivables";
const VIEW = "receivables_with_balance";
const COLUMNS =
  "id, internal_reference, client_id, description, source_type, source_id, source_reference, subscription_id, contract_id, " +
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

export function createReceivableRepositorySupabase(client: SupabaseClient): ReceivableRepository {
  return {
    async list(query?: ReceivableListQuery) {
      let builder = client.from(VIEW).select(VIEW_COLUMNS).order("due_date", { ascending: true });
      if (query?.clientId) builder = builder.eq("client_id", query.clientId);
      if (query?.contractId) builder = builder.eq("contract_id", query.contractId);
      if (query?.subscriptionId) builder = builder.eq("subscription_id", query.subscriptionId);
      if (query?.status) builder = builder.eq("status", query.status);
      if (query?.sourceType) builder = builder.eq("source_type", query.sourceType);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomainWithBalance(row as unknown as ReceivableWithBalanceRow));
    },

    async getById(id) {
      const { data, error } = await client.from(VIEW).select(VIEW_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomainWithBalance(data as unknown as ReceivableWithBalanceRow) : null;
    },

    async findBySubscriptionAndCompetency(subscriptionId, competencyDate) {
      const { data, error } = await client
        .from(TABLE)
        .select(COLUMNS)
        .eq("subscription_id", subscriptionId)
        .eq("competency_date", competencyDate)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as ReceivableRow) : null;
    },

    async listOpenForOrigin(query) {
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
    let query = client.from(VIEW).select(LIST_VIEW_COLUMNS, { count: "exact" }).order("due_date", { ascending: true });

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
 * Quanto do total "Descontos/abatimentos" de um conjunto de títulos é
 * na verdade crédito aplicado (Parte 3B.1, item 18 — "não tratar
 * crédito aplicado como novo dinheiro recebido" / nunca misturar com
 * desconto de verdade nos relatórios). Só soma aplicações válidas.
 */
export async function sumCreditAppliedForReceivables(client: SupabaseClient, receivableIds: string[]): Promise<number> {
  if (receivableIds.length === 0) return 0;
  const { data, error } = await client
    .from("receivable_adjustments")
    .select("amount")
    .in("receivable_id", receivableIds)
    .eq("adjustment_type", "credit_applied")
    .is("reversed_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + Number((row as { amount: number }).amount), 0);
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
