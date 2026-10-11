"use server";

import type { Client } from "@ir/types";
import { clientDisplayName } from "@ir/types";
import { getClientService } from "../../composition/clientes";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { fuzzyMatches } from "../../lib/fuzzySearch";
import { toClientSearchResult, type ClientSearchResult } from "./clientSearchTypes";

const MAX_RESULTS = 8;

function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

/**
 * Busca de Cadastro para seletores únicos (ex.: "Cadastro" em Assinaturas) —
 * reusa sempre `clients` (nunca duplica cliente, nunca cria tabela
 * paralela). Nome/razão social tolera acento/caixa/erro pequeno
 * (`fuzzyMatches`, mesmo helper já usado em Aniversariantes); CPF/CNPJ e
 * referência interna usam comparação determinística/normalizada — nunca
 * fuzzy em documento, por risco de selecionar a pessoa errada.
 *
 * Resultado é a união (sem duplicar) de: match exato de documento, match
 * por substring na referência, e match fuzzy no nome — nessa ordem de
 * prioridade, limitado a MAX_RESULTS.
 */
export async function searchClientsAction(term: string): Promise<ClientSearchResult[]> {
  const query = term.trim();
  if (!query) return [];

  const clients = await getClientService(createSupabaseServerClient()).list();

  const digits = onlyDigits(query);
  const byDocument: Client[] =
    digits.length === 11 || digits.length === 14
      ? clients.filter((client) => (client.kind === "individual" ? client.cpf === digits : client.cnpj === digits))
      : [];

  const normalizedQuery = query.toLowerCase();
  const byReference = clients.filter((client) => client.reference.toLowerCase().includes(normalizedQuery));
  const byName = clients.filter((client) => fuzzyMatches(query, clientDisplayName(client)));

  const seen = new Set<string>();
  const ordered: Client[] = [];
  for (const group of [byDocument, byReference, byName]) {
    for (const client of group) {
      if (seen.has(client.id)) continue;
      seen.add(client.id);
      ordered.push(client);
    }
  }

  return ordered.slice(0, MAX_RESULTS).map(toClientSearchResult);
}
