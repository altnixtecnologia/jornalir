import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientKind, Subscription, SubscriptionPeriodicity, SubscriptionServiceType, SubscriptionStatus } from "@ir/types";
import type { NewSubscriptionRecord, SubscriptionChanges, SubscriptionListQuery, SubscriptionRepository } from "@ir/core";

const TABLE = "subscriptions";
const COLUMNS =
  "id, internal_reference, client_id, service_type, status, amount, periodicity, starts_at, due_date, notes, created_at, updated_at";

interface SubscriptionRow {
  id: string;
  internal_reference: string;
  client_id: string;
  service_type: SubscriptionServiceType;
  status: SubscriptionStatus;
  amount: number;
  periodicity: SubscriptionPeriodicity;
  starts_at: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    reference: row.internal_reference,
    clientId: row.client_id,
    serviceType: row.service_type,
    status: row.status,
    amount: Number(row.amount),
    periodicity: row.periodicity,
    startsAt: row.starts_at,
    dueDate: row.due_date ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: NewSubscriptionRecord | SubscriptionChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (record.clientId !== undefined) row.client_id = record.clientId;
  if (record.serviceType !== undefined) row.service_type = record.serviceType;
  if (record.status !== undefined) row.status = record.status;
  if (record.amount !== undefined) row.amount = record.amount;
  if (record.periodicity !== undefined) row.periodicity = record.periodicity;
  if (record.startsAt !== undefined) row.starts_at = record.startsAt;
  if (record.dueDate !== undefined) row.due_date = record.dueDate ?? null;
  if (record.notes !== undefined) row.notes = record.notes ?? null;
  return row;
}

export function createSubscriptionRepositorySupabase(client: SupabaseClient): SubscriptionRepository {
  return {
    async list(query?: SubscriptionListQuery) {
      let builder = client.from(TABLE).select(COLUMNS).order("created_at", { ascending: false });
      if (query?.clientId) builder = builder.eq("client_id", query.clientId);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as SubscriptionRow));
    },

    async getById(id) {
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as SubscriptionRow) : null;
    },

    async create(record) {
      const { data, error } = await client.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as SubscriptionRow);
    },

    async update(id, changes) {
      const { data, error } = await client.from(TABLE).update(toRow(changes)).eq("id", id).select(COLUMNS).single();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as SubscriptionRow);
    },
  };
}

export interface SubscriptionAdminPageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  clientId?: string;
  serviceType?: SubscriptionServiceType;
  status?: SubscriptionStatus;
}

/** Subscription + nome do cliente já resolvido — evita N+1 na listagem. */
export interface SubscriptionListItem extends Subscription {
  clientName: string;
  clientKind: ClientKind;
}

export interface SubscriptionAdminPageResult {
  subscriptions: SubscriptionListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function subscriptionPageSize(value?: number): number {
  return value === 25 || value === 50 || value === 100 ? value : 25;
}

interface SubscriptionRowWithClient extends SubscriptionRow {
  clients: {
    kind: ClientKind;
    full_name: string | null;
    company_name: string | null;
    trade_name: string | null;
  } | null;
}

function toListItem(row: SubscriptionRowWithClient): SubscriptionListItem {
  const clientName =
    row.clients?.kind === "company"
      ? row.clients.trade_name || row.clients.company_name || "(sem nome)"
      : row.clients?.full_name || "(sem nome)";
  return {
    ...toDomain(row),
    clientName,
    clientKind: row.clients?.kind ?? "individual",
  };
}

const LIST_COLUMNS = `${COLUMNS}, clients(kind, full_name, company_name, trade_name)`;

/**
 * Clientes cujo nome/razão social/CPF/CNPJ combina com o termo — usado só
 * para resolver quais `client_id` entram no OR da busca de assinaturas
 * (ver `listSubscriptionsAdminPageSupabase`). Resolvido numa consulta
 * separada, simples, de uma tabela só (nunca um filtro `.or()` cruzando
 * `subscriptions` e o embed `clients(...)` — o PostgREST tem comportamento
 * pouco previsível/difícil de validar pra OR através de relação embutida
 * sem um banco real à disposição pra testar; esta forma usa só filtros de
 * uma tabela, documentados e estáveis).
 */
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
 * Lista paginada pra tela de listagem — busca por referência da assinatura
 * OU por nome/razão social/CPF/CNPJ do cliente vinculado (resolvido via
 * `findMatchingClientIds` + `client_id.in.(...)`, nunca um join/OR direto
 * no embed — ver o comentário daquela função). Filtros de serviço/status/
 * cliente rodam no banco, nunca carregando tudo pro browser. O nome do
 * cliente pra exibição vem via embed (`clients(...)`) — mesmo recurso do
 * PostgREST já usado em `client_roles(role)` no Clientes.
 */
export async function listSubscriptionsAdminPageSupabase(
  client: SupabaseClient,
  input: SubscriptionAdminPageQuery = {},
): Promise<SubscriptionAdminPageResult> {
  const pageSize = subscriptionPageSize(input.pageSize);
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));

  const term = (input.search ?? "").trim().replace(/[%_,]/g, " ");
  const matchingClientIds = term ? await findMatchingClientIds(client, term) : [];

  const build = (page: number) => {
    let query = client.from(TABLE).select(LIST_COLUMNS, { count: "exact" }).order("created_at", { ascending: false });

    if (input.clientId) query = query.eq("client_id", input.clientId);
    if (input.serviceType) query = query.eq("service_type", input.serviceType);
    if (input.status) query = query.eq("status", input.status);

    if (term) {
      const ors = [`internal_reference.ilike.%${term}%`];
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
    subscriptions: (data ?? []).map((row) => toListItem(row as unknown as SubscriptionRowWithClient)),
    total,
    page,
    pageSize,
    totalPages,
  };
}
