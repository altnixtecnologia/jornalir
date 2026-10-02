import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, ClientAddress, ClientKind, ClientRole, ClientStatus } from "@ir/types";
import { ClientDuplicateFieldError, type ClientChanges, type ClientRepository, type NewClientRecord } from "@ir/core";

const TABLE = "clients";
const COLUMNS =
  "id, internal_reference, kind, status, full_name, cpf, birth_date, company_name, trade_name, cnpj, " +
  "state_registration, responsible_name, responsible_cpf, phone_primary, phone_secondary, whatsapp, email, " +
  "address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, " +
  "notes, created_at, updated_at, client_roles(role)";

interface ClientRow {
  id: string;
  internal_reference: string;
  kind: ClientKind;
  status: ClientStatus;
  full_name: string | null;
  cpf: string | null;
  birth_date: string | null;
  company_name: string | null;
  trade_name: string | null;
  cnpj: string | null;
  state_registration: string | null;
  responsible_name: string | null;
  responsible_cpf: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  whatsapp: string | null;
  email: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client_roles: { role: ClientRole }[] | null;
}

function toDomain(row: ClientRow): Client {
  const address: ClientAddress = {
    zip: row.address_zip ?? undefined,
    street: row.address_street ?? undefined,
    number: row.address_number ?? undefined,
    complement: row.address_complement ?? undefined,
    neighborhood: row.address_neighborhood ?? undefined,
    city: row.address_city ?? undefined,
    state: row.address_state ?? undefined,
  };
  return {
    id: row.id,
    reference: row.internal_reference,
    kind: row.kind,
    status: row.status,
    fullName: row.full_name ?? undefined,
    cpf: row.cpf ?? undefined,
    birthDate: row.birth_date ?? undefined,
    companyName: row.company_name ?? undefined,
    tradeName: row.trade_name ?? undefined,
    cnpj: row.cnpj ?? undefined,
    stateRegistration: row.state_registration ?? undefined,
    responsibleName: row.responsible_name ?? undefined,
    responsibleCpf: row.responsible_cpf ?? undefined,
    phonePrimary: row.phone_primary ?? undefined,
    phoneSecondary: row.phone_secondary ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    email: row.email ?? undefined,
    address,
    notes: row.notes ?? undefined,
    roles: (row.client_roles ?? []).map((r) => r.role),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Monta o jsonb enviado pra `save_client` — SEMPRE com TODO campo de
 * identidade presente (nunca omitido quando "undefined"), porque é a RPC
 * quem escreve cada coluna explicitamente a cada chamada. `NewClientRecord`/
 * `ClientChanges` já vêm completos do ClientService.normalizeFields (nunca
 * um patch parcial de verdade nesta app), então não há perda de informação
 * aqui — só a conversão de nome de campo (camelCase -> snake_case).
 */
function toClientJson(record: NewClientRecord | ClientChanges): Record<string, unknown> {
  return {
    kind: record.kind ?? null,
    status: record.status ?? null,
    full_name: record.fullName ?? null,
    cpf: record.cpf ?? null,
    birth_date: record.birthDate ?? null,
    company_name: record.companyName ?? null,
    trade_name: record.tradeName ?? null,
    cnpj: record.cnpj ?? null,
    state_registration: record.stateRegistration ?? null,
    responsible_name: record.responsibleName ?? null,
    responsible_cpf: record.responsibleCpf ?? null,
    phone_primary: record.phonePrimary ?? null,
    phone_secondary: record.phoneSecondary ?? null,
    whatsapp: record.whatsapp ?? null,
    email: record.email ?? null,
    address_zip: record.address?.zip ?? null,
    address_street: record.address?.street ?? null,
    address_number: record.address?.number ?? null,
    address_complement: record.address?.complement ?? null,
    address_neighborhood: record.address?.neighborhood ?? null,
    address_city: record.address?.city ?? null,
    address_state: record.address?.state ?? null,
    notes: record.notes ?? null,
  };
}

/** Converte violação de índice único (23505) em erro de domínio amigável —
 * nunca deixa o erro bruto do Postgres chegar na UI. Erros de RPC do
 * PostgREST preservam `code`/`message` do Postgres original, então a
 * mesma checagem vale tanto pra INSERT/UPDATE direto quanto pra `rpc()`. */
function rethrowAsDuplicate(error: { code?: string; message?: string }): never {
  if (error.code === "23505") {
    if (error.message?.includes("clients_cpf_unique")) throw new ClientDuplicateFieldError("cpf");
    if (error.message?.includes("clients_cnpj_unique")) throw new ClientDuplicateFieldError("cnpj");
  }
  throw new Error(error.message ?? "Falha ao salvar cliente.");
}

export function createClientRepositorySupabase(client: SupabaseClient): ClientRepository {
  return {
    async list() {
      const { data, error } = await client.from(TABLE).select(COLUMNS).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as ClientRow));
    },

    async getById(id) {
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as ClientRow) : null;
    },

    // create/update chamam a RPC save_client (cliente + papéis na mesma
    // transação — ver migration 20261011100000_clients.sql). Nunca faz
    // INSERT/UPDATE de `clients` e DELETE/INSERT de `client_roles` como
    // chamadas HTTP separadas: se qualquer parte falhar, nada é gravado.
    async create(record) {
      const result = await client.rpc("save_client", {
        p_id: null,
        p_client: toClientJson(record),
        p_roles: record.roles,
      });
      if (result.error) rethrowAsDuplicate(result.error);
      const newId = result.data as string;
      const reloaded = await client.from(TABLE).select(COLUMNS).eq("id", newId).single();
      if (reloaded.error) throw new Error(reloaded.error.message);
      return toDomain(reloaded.data as unknown as ClientRow);
    },

    async update(id, changes) {
      const result = await client.rpc("save_client", {
        p_id: id,
        p_client: toClientJson(changes),
        p_roles: changes.roles ?? [],
      });
      if (result.error) rethrowAsDuplicate(result.error);
      const reloaded = await client.from(TABLE).select(COLUMNS).eq("id", id).single();
      if (reloaded.error) throw new Error(reloaded.error.message);
      return toDomain(reloaded.data as unknown as ClientRow);
    },
  };
}

export interface ClientAdminPageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  kind?: ClientKind;
  status?: ClientStatus;
}

export interface ClientAdminPageResult {
  clients: Client[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function clientPageSize(value?: number): number {
  return value === 25 || value === 50 || value === 100 ? value : 25;
}

function cleanSearch(value?: string): string {
  return (value ?? "").trim().replace(/[%_,]/g, " ");
}

/** Lista paginada pra tela de listagem — busca por nome/razão social, CPF/
 * CNPJ (comparando a versão só-dígitos do termo), telefone/WhatsApp e
 * e-mail, mais os filtros de tipo e status. */
export async function listClientsAdminPageSupabase(
  client: SupabaseClient,
  input: ClientAdminPageQuery = {},
): Promise<ClientAdminPageResult> {
  const pageSize = clientPageSize(input.pageSize);
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));

  const build = (page: number) => {
    let query = client
      .from(TABLE)
      .select(COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false });

    if (input.kind) query = query.eq("kind", input.kind);
    if (input.status) query = query.eq("status", input.status);

    const term = cleanSearch(input.search);
    if (term) {
      const pattern = `%${term}%`;
      const digits = term.replace(/\D+/g, "");
      const ors = [
        `full_name.ilike.${pattern}`,
        `company_name.ilike.${pattern}`,
        `trade_name.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `phone_primary.ilike.${pattern}`,
        `phone_secondary.ilike.${pattern}`,
        `whatsapp.ilike.${pattern}`,
      ];
      if (digits) {
        ors.push(`cpf.ilike.%${digits}%`, `cnpj.ilike.%${digits}%`, `phone_primary.ilike.%${digits}%`, `whatsapp.ilike.%${digits}%`);
      }
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
    clients: (data ?? []).map((row) => toDomain(row as unknown as ClientRow)),
    total,
    page,
    pageSize,
    totalPages,
  };
}
