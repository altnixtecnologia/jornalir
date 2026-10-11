import type { Client } from "@ir/types";
import { clientDisplayName } from "@ir/types";

/** Resultado compacto de busca de Cadastro — só o necessário pra exibir e selecionar num seletor (ex.: Assinaturas). */
export interface ClientSearchResult {
  id: string;
  reference: string;
  displayName: string;
  kind: Client["kind"];
  document?: string;
  roles: Client["roles"];
}

export function toClientSearchResult(client: Client): ClientSearchResult {
  return {
    id: client.id,
    reference: client.reference,
    displayName: clientDisplayName(client),
    kind: client.kind,
    document: client.kind === "company" ? client.cnpj : client.cpf,
    roles: client.roles,
  };
}
