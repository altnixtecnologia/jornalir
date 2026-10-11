import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialChannel, CommercialProduct } from "@ir/types";
import type { CommercialProductChanges, CommercialProductListQuery, CommercialProductRepository, NewCommercialProductRecord } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";

const TABLE = "commercial_products";
const COLUMNS = "id, name, channel, description, suggested_price, active, created_by, created_at, updated_at";

interface ProductRow {
  id: string;
  name: string;
  channel: CommercialChannel;
  description: string | null;
  suggested_price: number | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: ProductRow): CommercialProduct {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    description: row.description ?? undefined,
    suggestedPrice: row.suggested_price !== null ? Number(row.suggested_price) : undefined,
    active: row.active,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: NewCommercialProductRecord | CommercialProductChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (record.name !== undefined) row.name = record.name;
  if (record.channel !== undefined) row.channel = record.channel;
  if (record.description !== undefined) row.description = record.description ?? null;
  if (record.suggestedPrice !== undefined) row.suggested_price = record.suggestedPrice ?? null;
  if (record.active !== undefined) row.active = record.active;
  return row;
}

// Catálogo demonstrativo (preview) — cobre os canais citados no domínio
// (Jornal impresso/Site/Painel LED/Redes sociais/Pacote); preço
// sugerido é só isso, nunca obriga o valor de uma venda real.
const PREVIEW_PRODUCTS: CommercialProduct[] = [
  {
    id: "preview-produto-1",
    name: "Classificado — edição impressa",
    channel: "newspaper",
    description: "Espaço publicitário na edição impressa semanal.",
    suggestedPrice: 150,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-produto-2",
    name: "Banner — site",
    channel: "website",
    description: "Banner rotativo no site institucional.",
    suggestedPrice: 300,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-produto-3",
    name: "Painel LED — mensal",
    channel: "led_panel",
    description: "Veiculação mensal no painel LED (sem automação de playlist nesta fase).",
    suggestedPrice: 450,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "preview-produto-4",
    name: "Pacote institucional (jornal + site)",
    channel: "package",
    description: "Combinado de edição impressa + site por período fechado.",
    suggestedPrice: 1200,
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

/** Catálogo de produtos/canais comerciais — nunca excluído, só active=false (mesmo princípio de NFS-e ServiceProfileRepository). */
export function createCommercialProductRepositorySupabase(client: SupabaseClient): CommercialProductRepository {
  return {
    async list(query: CommercialProductListQuery = {}) {
      if (isLocalPreviewEnabled()) {
        return PREVIEW_PRODUCTS.filter((p) => (query.activeOnly ? p.active : true) && (!query.channel || p.channel === query.channel));
      }
      let builder = client.from(TABLE).select(COLUMNS).order("name", { ascending: true });
      if (query.activeOnly) builder = builder.eq("active", true);
      if (query.channel) builder = builder.eq("channel", query.channel);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as ProductRow));
    },

    async getById(id) {
      if (isLocalPreviewEnabled()) return PREVIEW_PRODUCTS.find((p) => p.id === id) ?? null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as ProductRow) : null;
    },

    async create(record) {
      if (isLocalPreviewEnabled()) {
        const product: CommercialProduct = { ...record, id: `preview-produto-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        PREVIEW_PRODUCTS.push(product);
        return product;
      }
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as ProductRow);
    },

    async update(id, changes) {
      if (isLocalPreviewEnabled()) {
        const index = PREVIEW_PRODUCTS.findIndex((p) => p.id === id);
        if (index === -1) throw new Error(`Produto comercial não encontrado: ${id}`);
        PREVIEW_PRODUCTS[index] = { ...PREVIEW_PRODUCTS[index], ...changes, updatedAt: new Date().toISOString() };
        return PREVIEW_PRODUCTS[index];
      }
      const { data, error } = await client.from(TABLE).update(toRow(changes)).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as ProductRow);
    },
  };
}
