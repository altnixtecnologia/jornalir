import type { Client, ClientAddress, ContractTemplateVariable, InstitutionalContract } from "@ir/types";
import { clientDisplayName } from "@ir/types";
export { CONTRACT_TEMPLATE_AUTO_FIELDS } from "@ir/types";

/**
 * Preenchimento automático dos dados do contrato (Item 5, Lote 3,
 * Tarefa 2) — resolve os placeholders "{{chave}}" do modelo a partir
 * do cadastro de clientes e do contrato JÁ EXISTENTES (nunca cria um
 * cadastro paralelo, nunca inventa valor/data/cláusula). Campos
 * variáveis que o modelo exige e que não existem em nenhuma das duas
 * estruturas (ex.: "forma de pagamento") precisam vir de
 * `customValues`, preenchidos pelo operador antes de gerar — se
 * faltar algum obrigatório, `missingRequired` lista exatamente quais,
 * nunca um erro genérico.
 *
 * Substituição é SEMPRE troca literal de texto (`split/join`), nunca
 * `eval`/interpretação de expressão — um modelo nunca pode executar
 * código a partir do seu próprio conteúdo.
 */

function digitsOnly(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function formatCpf(value: string | undefined): string {
  const digits = digitsOnly(value);
  if (digits.length !== 11) return value?.trim() || "";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCnpj(value: string | undefined): string {
  const digits = digitsOnly(value);
  if (digits.length !== 14) return value?.trim() || "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatAddress(address: ClientAddress | undefined): string {
  if (!address) return "";
  const line1 = [address.street, address.number].filter(Boolean).join(", ");
  const line2 = [address.neighborhood, address.city, address.state].filter(Boolean).join(" - ");
  const zip = address.zip ? `CEP ${address.zip}` : "";
  return [line1, address.complement, line2, zip].filter(Boolean).join(", ");
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const parsed = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("pt-BR");
}

export interface ResolveTemplateInput {
  content: string;
  variables: ContractTemplateVariable[];
  client: Pick<Client, "kind" | "fullName" | "companyName" | "tradeName" | "cpf" | "cnpj" | "responsibleName" | "phonePrimary" | "whatsapp" | "email" | "address">;
  contract: Pick<InstitutionalContract, "contractNumber" | "reference" | "object" | "contractedAmount" | "startsAt" | "endsAt">;
  customValues: Record<string, string>;
  generatedAt: Date;
}

export interface ResolveTemplateResult {
  missingRequired: ContractTemplateVariable[];
  resolvedContent: string;
  fieldValues: Record<string, string>;
}

function buildAutoFieldValues(client: ResolveTemplateInput["client"], contract: ResolveTemplateInput["contract"], generatedAt: Date): Record<string, string> {
  const contact = [client.phonePrimary || client.whatsapp, client.email].filter(Boolean).join(" · ");
  return {
    "cliente.nome": clientDisplayName(client),
    "cliente.cpf_cnpj": client.kind === "company" ? formatCnpj(client.cnpj) : formatCpf(client.cpf),
    "cliente.endereco": formatAddress(client.address),
    "cliente.representante": client.kind === "company" ? (client.responsibleName ?? "") : "",
    "cliente.contato": contact,
    "contrato.numero": contract.contractNumber ?? "",
    "contrato.referencia": contract.reference ?? "",
    "contrato.objeto": contract.object ?? "",
    "contrato.valor": formatCurrency(contract.contractedAmount),
    "contrato.vigencia_inicio": formatDate(contract.startsAt),
    "contrato.vigencia_fim": formatDate(contract.endsAt),
    "data.hoje": generatedAt.toLocaleDateString("pt-BR"),
  };
}

export function resolveTemplateVariables(input: ResolveTemplateInput): ResolveTemplateResult {
  const autoValues = buildAutoFieldValues(input.client, input.contract, input.generatedAt);
  const missingRequired: ContractTemplateVariable[] = [];
  const fieldValues: Record<string, string> = { ...autoValues };

  for (const variable of input.variables) {
    const value = (input.customValues[variable.key] ?? "").trim();
    if (variable.required && !value) {
      missingRequired.push(variable);
      continue;
    }
    fieldValues[variable.key] = value;
  }

  if (missingRequired.length > 0) {
    return { missingRequired, resolvedContent: input.content, fieldValues };
  }

  let resolvedContent = input.content;
  for (const [key, value] of Object.entries(fieldValues)) {
    resolvedContent = resolvedContent.split(`{{${key}}}`).join(value);
  }

  return { missingRequired: [], resolvedContent, fieldValues };
}
