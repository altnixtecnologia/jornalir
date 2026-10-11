import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialCondition, CommercialProposal, CommercialProposalItem, CommercialProposalStatus, CommercialProposalWithItems, NewCommercialProposalItemInput } from "@ir/types";
import { computeProposalTotal } from "@ir/types";
import type {
  CommercialProposalChanges,
  CommercialProposalListQuery,
  CommercialProposalRepository,
  NewCommercialProposalRecord,
} from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "commercial_proposals";
const ITEMS_TABLE = "commercial_proposal_items";
const COLUMNS =
  "id, internal_reference, client_id, proposal_date, valid_until, commercial_condition, status, converted_sale_id, notes, internal_notes, " +
  "created_by, updated_by, created_at, updated_at";
const ITEM_COLUMNS = "id, proposal_id, product_id, description, quantity, unit_price, discount_amount, sort_order, created_at";

interface ProposalRow {
  id: string;
  internal_reference: string;
  client_id: string;
  proposal_date: string;
  valid_until: string | null;
  commercial_condition: CommercialCondition;
  status: CommercialProposalStatus;
  converted_sale_id: string | null;
  notes: string | null;
  internal_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  proposal_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  sort_order: number;
  created_at: string;
}

function toDomain(row: ProposalRow): CommercialProposal {
  return {
    id: row.id,
    reference: row.internal_reference,
    clientId: row.client_id,
    proposalDate: row.proposal_date,
    validUntil: row.valid_until ?? undefined,
    commercialCondition: row.commercial_condition,
    status: row.status,
    convertedSaleId: row.converted_sale_id ?? undefined,
    notes: row.notes ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    updatedByProfileId: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function itemToDomain(row: ItemRow): CommercialProposalItem {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    productId: row.product_id ?? undefined,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    discountAmount: Number(row.discount_amount),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function toRow(record: NewCommercialProposalRecord | CommercialProposalChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (record.clientId !== undefined) row.client_id = record.clientId;
  if (record.proposalDate !== undefined) row.proposal_date = record.proposalDate;
  if (record.validUntil !== undefined) row.valid_until = record.validUntil ?? null;
  if (record.commercialCondition !== undefined) row.commercial_condition = record.commercialCondition;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  if (record.internalNotes !== undefined) row.internal_notes = record.internalNotes ?? null;
  if ("status" in record && record.status !== undefined) row.status = record.status;
  if ("convertedSaleId" in record && record.convertedSaleId !== undefined) row.converted_sale_id = record.convertedSaleId ?? null;
  return row;
}

function itemToRow(proposalId: string, item: NewCommercialProposalItemInput): Record<string, unknown> {
  return {
    proposal_id: proposalId,
    product_id: item.productId ?? null,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    discount_amount: item.discountAmount,
    sort_order: item.sortOrder,
  };
}

// Propostas demonstrativas (preview) — em memória só pela duração do
// processo. preview-proposta-1 (PF, enviada, 2 itens); preview-proposta-2
// (PJ, aprovada, convertida em preview-venda-7 — ver commercialSaleRepository.supabase.ts);
// preview-proposta-3 (PF, rascunho, vencida — validUntil no passado);
// preview-proposta-4 (PJ, recusada).
export const PREVIEW_PROPOSALS: CommercialProposal[] = [
  {
    id: "preview-proposta-1",
    reference: "IR-PROP-2026-000001",
    clientId: "preview-cliente-1",
    proposalDate: "2026-10-05",
    validUntil: "2026-11-05",
    commercialCondition: "installments",
    status: "sent",
    notes: "Proposta de pacote de classificados — demonstração.",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-proposta-2",
    reference: "IR-PROP-2026-000002",
    clientId: "preview-cliente-2",
    proposalDate: "2026-09-20",
    validUntil: "2026-10-20",
    commercialCondition: "cash",
    status: "approved",
    convertedSaleId: "preview-venda-7",
    notes: "Pacote institucional — convertida em venda (demonstração).",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-proposta-3",
    reference: "IR-PROP-2026-000003",
    clientId: "preview-cliente-1",
    proposalDate: "2026-09-01",
    validUntil: "2026-09-15",
    commercialCondition: "cash",
    status: "draft",
    notes: "Proposta de banner — demonstração de proposta vencida (validade no passado, rascunho nunca enviado).",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-proposta-4",
    reference: "IR-PROP-2026-000004",
    clientId: "preview-cliente-2",
    proposalDate: "2026-10-01",
    validUntil: "2026-10-31",
    commercialCondition: "cash",
    status: "rejected",
    notes: "Painel LED — demonstração de proposta recusada.",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

export const PREVIEW_PROPOSAL_ITEMS: CommercialProposalItem[] = [
  { id: "preview-item-1a", proposalId: "preview-proposta-1", productId: "preview-produto-1", description: "Classificado — edição impressa (4 semanas)", quantity: 4, unitPrice: 75, discountAmount: 0, sortOrder: 0, createdAt: new Date(0).toISOString() },
  { id: "preview-item-1b", proposalId: "preview-proposta-1", description: "Diagramação personalizada", quantity: 1, unitPrice: 50, discountAmount: 10, sortOrder: 1, createdAt: new Date(0).toISOString() },
  { id: "preview-item-2a", proposalId: "preview-proposta-2", productId: "preview-produto-4", description: "Pacote institucional (jornal + site) — setembro/2026", quantity: 1, unitPrice: 1200, discountAmount: 0, sortOrder: 0, createdAt: new Date(0).toISOString() },
  { id: "preview-item-3a", proposalId: "preview-proposta-3", productId: "preview-produto-2", description: "Banner — site institucional (1 mês)", quantity: 1, unitPrice: 300, discountAmount: 0, sortOrder: 0, createdAt: new Date(0).toISOString() },
  { id: "preview-item-4a", proposalId: "preview-proposta-4", productId: "preview-produto-3", description: "Painel LED — mensal", quantity: 1, unitPrice: 450, discountAmount: 50, sortOrder: 0, createdAt: new Date(0).toISOString() },
];

function matchesPreviewQuery(proposal: CommercialProposal, query?: CommercialProposalListQuery): boolean {
  if (!query) return true;
  if (query.clientId && proposal.clientId !== query.clientId) return false;
  if (query.status && proposal.status !== query.status) return false;
  if (query.search) {
    const term = query.search.toLowerCase();
    if (!proposal.reference.toLowerCase().includes(term) && !(proposal.notes ?? "").toLowerCase().includes(term)) return false;
  }
  return true;
}

function withItems(proposal: CommercialProposal, items: CommercialProposalItem[]): CommercialProposalWithItems {
  const proposalItems = items.filter((item) => item.proposalId === proposal.id).sort((a, b) => a.sortOrder - b.sortOrder);
  return { ...proposal, items: proposalItems, total: computeProposalTotal(proposalItems) };
}

/** Proposta/orçamento — nunca excluída fisicamente, só status=archived (mesmo princípio de commercial_sales). Itens têm delete real (ver migration). */
export function createCommercialProposalRepositorySupabase(client: SupabaseClient): CommercialProposalRepository {
  return {
    async list(query: CommercialProposalListQuery = {}) {
      if (isLocalPreviewEnabled()) return PREVIEW_PROPOSALS.filter((p) => matchesPreviewQuery(p, query));
      let builder = client.from(TABLE).select(COLUMNS).order("created_at", { ascending: false });
      if (query.clientId) builder = builder.eq("client_id", query.clientId);
      if (query.status) builder = builder.eq("status", query.status);
      if (query.search) {
        const term = query.search.trim().replace(/[%_,]/g, " ");
        builder = builder.or(`internal_reference.ilike.%${term}%,notes.ilike.%${term}%`);
      }
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as ProposalRow));
    },

    async getById(id) {
      if (isLocalPreviewEnabled()) return PREVIEW_PROPOSALS.find((p) => p.id === id) ?? null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as ProposalRow) : null;
    },

    async getWithItems(id) {
      if (isLocalPreviewEnabled()) {
        const proposal = PREVIEW_PROPOSALS.find((p) => p.id === id);
        return proposal ? withItems(proposal, PREVIEW_PROPOSAL_ITEMS) : null;
      }
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const { data: itemRows, error: itemsError } = await client.from(ITEMS_TABLE).select(ITEM_COLUMNS).eq("proposal_id", id).order("sort_order", { ascending: true });
      if (itemsError) throw new Error(itemsError.message);
      const items = (itemRows ?? []).map((row) => itemToDomain(row as unknown as ItemRow));
      return { ...toDomain(data as unknown as ProposalRow), items, total: computeProposalTotal(items) };
    },

    async createWithItems(record, items) {
      if (isLocalPreviewEnabled()) {
        const proposal: CommercialProposal = {
          ...record,
          id: `preview-proposta-${Date.now()}`,
          reference: `IR-PROP-PREVIEW-${PREVIEW_PROPOSALS.length + 1}`,
          status: "draft",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        PREVIEW_PROPOSALS.push(proposal);
        const newItems: CommercialProposalItem[] = items.map((item, index) => ({
          ...item,
          id: `preview-item-${Date.now()}-${index}`,
          proposalId: proposal.id,
          createdAt: new Date().toISOString(),
        }));
        PREVIEW_PROPOSAL_ITEMS.push(...newItems);
        return withItems(proposal, PREVIEW_PROPOSAL_ITEMS);
      }
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      const proposal = toDomain(data as unknown as ProposalRow);
      if (items.length > 0) {
        const { error: itemsError } = await client.from(ITEMS_TABLE).insert(items.map((item) => itemToRow(proposal.id, item)));
        if (itemsError) throw new Error(itemsError.message);
      }
      const result = await this.getWithItems(proposal.id);
      if (!result) throw new Error("Falha ao recarregar a proposta recém-criada.");
      return result;
    },

    async replaceItems(proposalId, items) {
      if (isLocalPreviewEnabled()) {
        const remaining = PREVIEW_PROPOSAL_ITEMS.filter((item) => item.proposalId !== proposalId);
        PREVIEW_PROPOSAL_ITEMS.length = 0;
        PREVIEW_PROPOSAL_ITEMS.push(...remaining);
        const newItems: CommercialProposalItem[] = items.map((item, index) => ({
          ...item,
          id: `preview-item-${Date.now()}-${index}`,
          proposalId,
          createdAt: new Date().toISOString(),
        }));
        PREVIEW_PROPOSAL_ITEMS.push(...newItems);
        const proposal = PREVIEW_PROPOSALS.find((p) => p.id === proposalId);
        if (!proposal) throw new Error(`Proposta não encontrada: ${proposalId}`);
        return withItems(proposal, PREVIEW_PROPOSAL_ITEMS);
      }
      const { error: deleteError } = await client.from(ITEMS_TABLE).delete().eq("proposal_id", proposalId);
      if (deleteError) throw new Error(deleteError.message);
      if (items.length > 0) {
        const { error: insertError } = await client.from(ITEMS_TABLE).insert(items.map((item) => itemToRow(proposalId, item)));
        if (insertError) throw new Error(insertError.message);
      }
      const result = await this.getWithItems(proposalId);
      if (!result) throw new Error(`Proposta não encontrada: ${proposalId}`);
      return result;
    },

    async update(id, changes) {
      if (isLocalPreviewEnabled()) {
        const index = PREVIEW_PROPOSALS.findIndex((p) => p.id === id);
        if (index === -1) throw new Error(`Proposta não encontrada: ${id}`);
        PREVIEW_PROPOSALS[index] = { ...PREVIEW_PROPOSALS[index], ...changes, updatedAt: new Date().toISOString() };
        return PREVIEW_PROPOSALS[index];
      }
      const { data, error } = await client.from(TABLE).update(toRow(changes)).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as ProposalRow);
    },
  };
}

export interface CommercialProposalListItem {
  id: string;
  reference: string;
  clientName: string;
  proposalDate: string;
  validUntil?: string;
  status: CommercialProposalStatus;
  total: number;
}

const PREVIEW_CLIENT_NAMES: Record<string, string> = {
  "preview-cliente-1": "Cliente de Exemplo (visualização local)",
  "preview-cliente-2": "Empresa de Exemplo Ltda. (visualização local)",
};

/** Listagem simples com nome do cliente e total já calculado — evita N+1 na tela de listagem (mesmo princípio de listReceivablesForContractsSupabase). Sem paginação nesta primeira versão (volume esperado é pequeno). */
export async function listCommercialProposalsWithTotalsSupabase(client: SupabaseClient, query: CommercialProposalListQuery = {}): Promise<CommercialProposalListItem[]> {
  if (isLocalPreviewEnabled()) {
    return PREVIEW_PROPOSALS.filter((p) => matchesPreviewQuery(p, query)).map((p) => ({
      id: p.id,
      reference: p.reference,
      clientName: PREVIEW_CLIENT_NAMES[p.clientId] ?? "(sem nome)",
      proposalDate: p.proposalDate,
      validUntil: p.validUntil,
      status: p.status,
      total: computeProposalTotal(PREVIEW_PROPOSAL_ITEMS.filter((item) => item.proposalId === p.id)),
    }));
  }

  let builder = client
    .from(TABLE)
    .select(`${COLUMNS}, clients(kind, full_name, company_name, trade_name), commercial_proposal_items(quantity, unit_price, discount_amount)`)
    .order("created_at", { ascending: false });
  if (query.clientId) builder = builder.eq("client_id", query.clientId);
  if (query.status) builder = builder.eq("status", query.status);
  if (query.search) {
    const term = query.search.trim().replace(/[%_,]/g, " ");
    builder = builder.or(`internal_reference.ilike.%${term}%,notes.ilike.%${term}%`);
  }
  const { data, error } = await builder;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const typed = row as unknown as ProposalRow & {
      clients: { kind: "individual" | "company"; full_name: string | null; company_name: string | null; trade_name: string | null } | null;
      commercial_proposal_items: { quantity: number; unit_price: number; discount_amount: number }[];
    };
    const clientName =
      typed.clients?.kind === "company"
        ? typed.clients.trade_name || typed.clients.company_name || "(sem nome)"
        : typed.clients?.full_name || "(sem nome)";
    const total = computeProposalTotal(
      typed.commercial_proposal_items.map((item) => ({ quantity: Number(item.quantity), unitPrice: Number(item.unit_price), discountAmount: Number(item.discount_amount) })),
    );
    return { id: typed.id, reference: typed.internal_reference, clientName, proposalDate: typed.proposal_date, validUntil: typed.valid_until ?? undefined, status: typed.status, total };
  });
}
