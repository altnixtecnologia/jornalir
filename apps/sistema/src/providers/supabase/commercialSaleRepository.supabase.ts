import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialCondition, CommercialSale, CommercialSaleStatus } from "@ir/types";
import type { CommercialSaleChanges, CommercialSaleListQuery, CommercialSaleRepository, NewCommercialSaleRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "commercial_sales";
const COLUMNS =
  "id, internal_reference, client_id, proposal_id, product_id, channel, description, start_date, end_date, amount, " +
  "commercial_condition, installments_count, status, notes, created_by, updated_by, created_at, updated_at";

interface SaleRow {
  id: string;
  internal_reference: string;
  client_id: string;
  proposal_id: string | null;
  product_id: string | null;
  channel: string;
  description: string;
  start_date: string;
  end_date: string | null;
  amount: number;
  commercial_condition: CommercialCondition;
  installments_count: number;
  status: CommercialSaleStatus;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: SaleRow): CommercialSale {
  return {
    id: row.id,
    reference: row.internal_reference,
    clientId: row.client_id,
    proposalId: row.proposal_id ?? undefined,
    productId: row.product_id ?? undefined,
    channel: row.channel,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    amount: Number(row.amount),
    commercialCondition: row.commercial_condition,
    installmentsCount: Number(row.installments_count),
    status: row.status,
    notes: row.notes ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    updatedByProfileId: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: NewCommercialSaleRecord | CommercialSaleChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (record.clientId !== undefined) row.client_id = record.clientId;
  if (record.proposalId !== undefined) row.proposal_id = record.proposalId ?? null;
  if (record.productId !== undefined) row.product_id = record.productId ?? null;
  if (record.channel !== undefined) row.channel = record.channel;
  if (record.description !== undefined) row.description = record.description;
  if (record.startDate !== undefined) row.start_date = record.startDate;
  if (record.endDate !== undefined) row.end_date = record.endDate ?? null;
  if (record.amount !== undefined) row.amount = record.amount;
  if (record.commercialCondition !== undefined) row.commercial_condition = record.commercialCondition;
  if (record.installmentsCount !== undefined) row.installments_count = record.installmentsCount;
  if (record.status !== undefined) row.status = record.status;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  return row;
}

// Vendas demonstrativas (preview) — em memória só pela duração do
// processo, mesmo princípio dos demais módulos em SYSTEM_LOCAL_PREVIEW=1.
// preview-venda-1 (PF): status "active", Financeiro PENDENTE (ver
// REC-000006 em receivableRepository.supabase.ts).
// preview-venda-2 (PJ): status "completed", Financeiro PAGO (REC-000007).
// preview-venda-3 (PJ): negociada como PERMUTA (commercial_condition=
// 'trade'), Financeiro em aberto (REC-000008) — a condição negociada é
// permuta, mas o título ainda pode ser liquidado de qualquer forma.
// preview-venda-4 (PF): status "proposal", SEM Financeiro gerado ainda —
// demonstra o estado "Não gerado".
export const PREVIEW_COMMERCIAL_SALES: CommercialSale[] = [
  {
    id: "preview-venda-1",
    reference: "IR-COM-2026-000001",
    clientId: "preview-cliente-1",
    productId: "preview-produto-1",
    channel: "Jornal impresso",
    description: "Classificado — edição impressa (demonstração)",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    amount: 300,
    commercialCondition: "installments",
    installmentsCount: 2,
    status: "active",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-venda-2",
    reference: "IR-COM-2026-000002",
    clientId: "preview-cliente-2",
    productId: "preview-produto-4",
    channel: "Pacote institucional (jornal + site)",
    description: "Pacote institucional — setembro/2026 (demonstração)",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    amount: 1200,
    commercialCondition: "cash",
    installmentsCount: 1,
    status: "completed",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-venda-3",
    reference: "IR-COM-2026-000003",
    clientId: "preview-cliente-2",
    productId: "preview-produto-3",
    channel: "Painel LED",
    description: "Painel LED — outubro/2026, negociado em permuta (demonstração)",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    amount: 450,
    commercialCondition: "trade",
    installmentsCount: 1,
    status: "active",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-venda-4",
    reference: "IR-COM-2026-000004",
    clientId: "preview-cliente-1",
    productId: "preview-produto-2",
    channel: "Site",
    description: "Banner — site institucional, proposta em aberto (demonstração)",
    startDate: "2026-11-01",
    amount: 300,
    commercialCondition: "cash",
    installmentsCount: 1,
    status: "proposal",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  // preview-venda-5 (PF): cortesia — "Gerar Financeiro" fica indisponível
  // (ver generateCommercialSaleFinanceiroAction), nunca cria título de
  // R$ 0,00; a venda em si continua válida comercialmente.
  {
    id: "preview-venda-5",
    reference: "IR-COM-2026-000005",
    clientId: "preview-cliente-1",
    productId: "preview-produto-1",
    channel: "Jornal impresso",
    description: "Classificado institucional — cortesia (demonstração)",
    startDate: "2026-10-15",
    endDate: "2026-10-31",
    amount: 150,
    commercialCondition: "courtesy",
    installmentsCount: 1,
    status: "active",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  // preview-venda-6 (PJ): CANCELADA, mas com título já gerado e PAGO antes
  // do cancelamento — demonstra que cancelar a venda nunca apaga/altera o
  // histórico financeiro (ver REC-000009 em receivableRepository.supabase.ts).
  {
    id: "preview-venda-6",
    reference: "IR-COM-2026-000006",
    clientId: "preview-cliente-2",
    productId: "preview-produto-2",
    channel: "Site",
    description: "Banner — site institucional, venda cancelada após gerar Financeiro (demonstração)",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    amount: 300,
    commercialCondition: "cash",
    installmentsCount: 1,
    status: "cancelled",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  // preview-venda-7 (PJ): nasceu da conversão de preview-proposta-2 (ver
  // commercialProposalRepository.supabase.ts) — demonstra o vínculo
  // proposta -> venda (proposalId) e a história completa: proposta
  // aprovada, convertida, Financeiro ainda não gerado.
  {
    id: "preview-venda-7",
    reference: "IR-COM-2026-000007",
    clientId: "preview-cliente-2",
    proposalId: "preview-proposta-2",
    productId: "preview-produto-4",
    channel: "Pacote institucional (jornal + site)",
    description: "Pacote institucional — convertido da proposta IR-PROP-2026-000002 (demonstração)",
    startDate: "2026-09-20",
    amount: 1200,
    commercialCondition: "cash",
    installmentsCount: 1,
    status: "approved",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

function matchesPreviewQuery(sale: CommercialSale, query?: CommercialSaleListQuery): boolean {
  if (!query) return true;
  if (query.clientId && sale.clientId !== query.clientId) return false;
  if (query.status && sale.status !== query.status) return false;
  if (query.startFrom && sale.startDate < query.startFrom) return false;
  if (query.startTo && sale.startDate > query.startTo) return false;
  if (query.search) {
    const term = query.search.toLowerCase();
    if (!sale.reference.toLowerCase().includes(term) && !sale.description.toLowerCase().includes(term) && !sale.channel.toLowerCase().includes(term)) return false;
  }
  return true;
}

/** Venda/contratação comercial — nunca excluída fisicamente, só status=cancelled (mesmo princípio de receivables/contratos/rascunhos NFS-e). */
export function createCommercialSaleRepositorySupabase(client: SupabaseClient): CommercialSaleRepository {
  return {
    async list(query: CommercialSaleListQuery = {}) {
      if (isLocalPreviewEnabled()) return PREVIEW_COMMERCIAL_SALES.filter((s) => matchesPreviewQuery(s, query));
      let builder = client.from(TABLE).select(COLUMNS).order("created_at", { ascending: false });
      if (query.clientId) builder = builder.eq("client_id", query.clientId);
      if (query.status) builder = builder.eq("status", query.status);
      if (query.startFrom) builder = builder.gte("start_date", query.startFrom);
      if (query.startTo) builder = builder.lte("start_date", query.startTo);
      if (query.search) {
        const term = query.search.trim().replace(/[%_,]/g, " ");
        builder = builder.or(`internal_reference.ilike.%${term}%,description.ilike.%${term}%,channel.ilike.%${term}%`);
      }
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as SaleRow));
    },

    async getById(id) {
      if (isLocalPreviewEnabled()) return PREVIEW_COMMERCIAL_SALES.find((s) => s.id === id) ?? null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as SaleRow) : null;
    },

    async create(record) {
      if (isLocalPreviewEnabled()) {
        const sale: CommercialSale = {
          ...record,
          id: `preview-venda-${Date.now()}`,
          reference: `IR-COM-PREVIEW-${PREVIEW_COMMERCIAL_SALES.length + 1}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        PREVIEW_COMMERCIAL_SALES.push(sale);
        return sale;
      }
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as SaleRow);
    },

    async update(id, changes) {
      if (isLocalPreviewEnabled()) {
        const index = PREVIEW_COMMERCIAL_SALES.findIndex((s) => s.id === id);
        if (index === -1) throw new Error(`Venda comercial não encontrada: ${id}`);
        PREVIEW_COMMERCIAL_SALES[index] = { ...PREVIEW_COMMERCIAL_SALES[index], ...changes, updatedAt: new Date().toISOString() };
        return PREVIEW_COMMERCIAL_SALES[index];
      }
      const { data, error } = await client.from(TABLE).update(toRow(changes)).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as SaleRow);
    },
  };
}

export interface CommercialSaleAdminPageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CommercialSaleStatus;
  clientId?: string;
  startFrom?: string;
  startTo?: string;
}

export interface CommercialSaleListItem extends CommercialSale {
  clientName: string;
}

export interface CommercialSaleAdminPageResult {
  sales: CommercialSaleListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function salePageSize(value?: number): number {
  return value === 25 || value === 50 || value === 100 ? value : 25;
}

interface SaleRowWithClient extends SaleRow {
  clients: { kind: "individual" | "company"; full_name: string | null; company_name: string | null; trade_name: string | null } | null;
}

function clientNameFromEmbedded(row: SaleRowWithClient): string {
  return row.clients?.kind === "company"
    ? row.clients.trade_name || row.clients.company_name || "(sem nome)"
    : row.clients?.full_name || "(sem nome)";
}

function toListItem(row: SaleRowWithClient): CommercialSaleListItem {
  return { ...toDomain(row), clientName: clientNameFromEmbedded(row) };
}

const LIST_COLUMNS = `${COLUMNS}, clients(kind, full_name, company_name, trade_name)`;

/** Nunca um .or() cruzando a tabela base com o embed `clients(...)` — mesmo princípio de findMatchingClientIds em Financeiro/Assinaturas. */
async function findMatchingClientIds(client: SupabaseClient, term: string): Promise<string[]> {
  const pattern = `%${term}%`;
  const digits = term.replace(/\D+/g, "");
  const ors = [`full_name.ilike.${pattern}`, `company_name.ilike.${pattern}`, `trade_name.ilike.${pattern}`];
  if (digits) ors.push(`cpf.ilike.%${digits}%`, `cnpj.ilike.%${digits}%`);
  const { data, error } = await client.from("clients").select("id").or(ors.join(","));
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => (row as { id: string }).id);
}

function matchesPreviewAdminQuery(sale: CommercialSaleListItem, input: CommercialSaleAdminPageQuery): boolean {
  if (input.status && sale.status !== input.status) return false;
  if (input.clientId && sale.clientId !== input.clientId) return false;
  if (input.startFrom && sale.startDate < input.startFrom) return false;
  if (input.startTo && sale.startDate > input.startTo) return false;
  if (input.search) {
    const term = input.search.toLowerCase();
    const haystack = `${sale.reference} ${sale.description} ${sale.channel} ${sale.clientName}`.toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  return true;
}

const PREVIEW_CLIENT_NAMES: Record<string, string> = {
  "preview-cliente-1": "Cliente de Exemplo (visualização local)",
  "preview-cliente-2": "Empresa de Exemplo Ltda. (visualização local)",
};

/**
 * Listagem paginada/filtrada da tela de Vendas (item 21/30/31) — busca
 * por referência/descrição/canal OU nome/razão social/CPF/CNPJ do
 * cliente, ordenação fixa por created_at desc (sem seta clicável — não
 * existe ordenação dinâmica real ainda). Mesmo princípio de
 * listReceivablesAdminPageSupabase (Financeiro): nunca paginação
 * client-side.
 */
export async function listCommercialSalesAdminPageSupabase(
  client: SupabaseClient,
  input: CommercialSaleAdminPageQuery = {},
): Promise<CommercialSaleAdminPageResult> {
  const pageSize = salePageSize(input.pageSize);

  if (isLocalPreviewEnabled()) {
    const items = PREVIEW_COMMERCIAL_SALES.map((sale) => ({ ...sale, clientName: PREVIEW_CLIENT_NAMES[sale.clientId] ?? "(sem nome)" })).filter((sale) =>
      matchesPreviewAdminQuery(sale, input),
    );
    return { sales: items, total: items.length, page: 1, pageSize, totalPages: 1 };
  }

  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));
  const term = (input.search ?? "").trim().replace(/[%_,]/g, " ");
  const matchingClientIds = term ? await findMatchingClientIds(client, term) : [];

  const build = (page: number) => {
    let query = client.from(TABLE).select(LIST_COLUMNS, { count: "exact" }).order("created_at", { ascending: false });
    if (input.status) query = query.eq("status", input.status);
    if (input.clientId) query = query.eq("client_id", input.clientId);
    if (input.startFrom) query = query.gte("start_date", input.startFrom);
    if (input.startTo) query = query.lte("start_date", input.startTo);
    if (term) {
      const ors = [`internal_reference.ilike.%${term}%`, `description.ilike.%${term}%`, `channel.ilike.%${term}%`];
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
    sales: (data ?? []).map((row) => toListItem(row as unknown as SaleRowWithClient)),
    total,
    page,
    pageSize,
    totalPages,
  };
}
