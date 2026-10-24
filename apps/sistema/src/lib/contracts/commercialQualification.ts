import type { Client } from "@ir/types";

/**
 * Qualificação da parte contratante obtida do cadastro mestre, nunca de
 * campos livres do modelo. Não aprova juridicamente o instrumento.
 * Campos ausentes tornam a minuta indisponível para conferência PDF.
 */
export function qualifyCommercialClient(client: Client): {
  missing: string[];
  variables: Record<string, string>;
} {
  const missing: string[] = [];
  const required = (value: string | undefined, label: string): string => {
    const clean = (value ?? "").trim();
    if (!clean) missing.push(label);
    return clean;
  };
  const legalName = client.kind === "company"
    ? required(client.companyName, "Cliente: razão social")
    : required(client.fullName, "Cliente: nome completo");
  const document = client.kind === "company"
    ? required(client.cnpj, "Cliente: CNPJ")
    : required(client.cpf, "Cliente: CPF");
  const expectedLength = client.kind === "company" ? 14 : 11;
  if (document && !new RegExp("^\\d{" + expectedLength + "}$").test(document)) {
    missing.push("Cliente: CPF/CNPJ inválido");
  }
  const responsible = client.kind === "company"
    ? required(client.responsibleName, "Cliente: responsável legal")
    : legalName;
  const responsibleDocument = client.kind === "company"
    ? required(client.responsibleCpf, "Cliente: CPF do responsável legal")
    : document;
  if (responsibleDocument && !/^\d{11}$/.test(responsibleDocument)) {
    missing.push("Cliente: CPF do signatário inválido");
  }
  const street = required(client.address.street, "Cliente: logradouro");
  const number = required(client.address.number, "Cliente: número do endereço (usar S/N quando aplicável)");
  const neighborhood = required(client.address.neighborhood, "Cliente: bairro");
  const city = required(client.address.city, "Cliente: município");
  const state = required(client.address.state, "Cliente: UF");
  const zip = required(client.address.zip, "Cliente: CEP");
  const address = [street, number, neighborhood, city, state, zip].filter(Boolean).join(", ");
  const legalType = client.kind === "company" ? "CNPJ" : "CPF";
  return {
    missing,
    variables: {
      "cliente.nome": legalName,
      "cliente.documento": document,
      "cliente.endereco": address,
      "cliente.representante": responsible,
      "cliente.representante_cpf": responsibleDocument,
      "cliente.qualificacao": [
        legalName, legalType + " " + document, address,
        ...(client.kind === "company" ? ["Representante: " + responsible + ", CPF " + responsibleDocument] : []),
      ].filter(Boolean).join(" — "),
    },
  };
}
