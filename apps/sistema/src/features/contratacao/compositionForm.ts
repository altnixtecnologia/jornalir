import type { CommercialProduct, ContractTemplate, ContractTemplateVariable } from "@ir/types";
import type { CompositionPeriodicity, CompositionServiceInput, CompositionServiceKind } from "../../lib/contracts/contractComposition";

/**
 * Estado do formulário de "Montagem de contratação" (strings, como o usuário
 * digita) e conversão para o contrato validado de `contractComposition.ts`.
 * Puro e testável; nenhuma regra de negócio vive só na tela.
 */

export interface ServiceRow {
  key: string;
  kind: CompositionServiceKind;
  productId: string;
  title: string;
  channel: string;
  description: string;
  quantity: string;
  listUnitPrice: string;
  negotiatedUnitPrice: string;
  negotiationReason: string;
  startsOn: string;
  endsOn: string;
  periodicity: CompositionPeriodicity;
  /** Só assinatura do jornal. */
  subscriptionServiceType: "impresso" | "digital";
  copies: string;
  deliveryNote: string;
  renewalNote: string;
  terminationNote: string;
}

/** Aceita "1.234,56", "1234,56" e "1234.56". Vazio/ilegível → NaN (a validação acusa). */
export function parseDecimal(value: string): number {
  const text = value.trim().replace(/\s/g, "");
  if (!text) return Number.NaN;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

export function decimalToField(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "" : String(value).replace(".", ",");
}

let counter = 0;
function nextKey(): string {
  counter += 1;
  return `svc-${Date.now().toString(36)}-${counter}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function oneYearFrom(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const end = new Date(Date.UTC(year + 1, month - 1, day));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export function newCatalogRow(product: CommercialProduct): ServiceRow {
  const start = today();
  return {
    key: nextKey(),
    kind: "catalog",
    productId: product.id,
    title: product.name,
    channel: product.channel,
    description: product.description ?? "",
    quantity: "1",
    listUnitPrice: decimalToField(product.suggestedPrice),
    negotiatedUnitPrice: decimalToField(product.suggestedPrice),
    negotiationReason: "",
    startsOn: start,
    endsOn: oneYearFrom(start),
    periodicity: "monthly",
    subscriptionServiceType: "impresso",
    copies: "1",
    deliveryNote: "",
    renewalNote: "",
    terminationNote: "",
  };
}

export function newFreeRow(kind: "subscription" | "other"): ServiceRow {
  const start = today();
  return {
    key: nextKey(),
    kind,
    productId: "",
    title: kind === "subscription" ? "Assinatura do jornal" : "",
    channel: "",
    description: "",
    quantity: "1",
    listUnitPrice: "",
    negotiatedUnitPrice: "",
    negotiationReason: "",
    startsOn: start,
    endsOn: oneYearFrom(start),
    periodicity: kind === "subscription" ? "annual" : "monthly",
    subscriptionServiceType: "impresso",
    copies: "1",
    deliveryNote: "",
    renewalNote: "",
    terminationNote: "",
  };
}

export function rowToInput(row: ServiceRow): CompositionServiceInput {
  return {
    kind: row.kind,
    productId: row.productId || undefined,
    title: row.title,
    channel: row.channel || undefined,
    description: row.description || undefined,
    quantity: parseDecimal(row.quantity),
    listUnitPrice: parseDecimal(row.listUnitPrice),
    negotiatedUnitPrice: parseDecimal(row.negotiatedUnitPrice),
    negotiationReason: row.negotiationReason || undefined,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    periodicity: row.periodicity,
    subscriptionServiceType: row.kind === "subscription" ? row.subscriptionServiceType : undefined,
    copies: row.kind === "subscription" && row.subscriptionServiceType === "impresso" ? parseDecimal(row.copies) : undefined,
    deliveryNote: row.deliveryNote || undefined,
    renewalNote: row.renewalNote || undefined,
    terminationNote: row.terminationNote || undefined,
  };
}

const RESERVED_PREFIXES = ["cliente.", "contrato.", "contratada.", "servicos.", "venda.", "data."];

/** Campos que o sistema preenche sozinho — o operador só digita os campos variáveis ADICIONAIS do modelo. */
export function isReservedVariableKey(key: string): boolean {
  return RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function manualVariables(template: Pick<ContractTemplate, "variables"> | undefined): ContractTemplateVariable[] {
  return (template?.variables ?? []).filter((variable) => !isReservedVariableKey(variable.key));
}

/**
 * O que "Criar contratação" vai gravar — exibido na confirmação, para o
 * operador saber exatamente quais cadastros serão criados. Nunca menciona
 * cobrança/ativação/assinatura porque nada disso é criado.
 */
export function describeContractingPlan(modality: "commercial" | "institutional", services: Array<Pick<CompositionServiceInput, "kind">>): string[] {
  if (modality === "institutional") {
    return [`1 contrato institucional com ${services.length} serviço${services.length > 1 ? "s" : ""} (lista estruturada nos dados do contrato).`];
  }
  const lines: string[] = [];
  const catalog = services.filter((service) => service.kind === "catalog").length;
  const subscriptions = services.filter((service) => service.kind === "subscription").length;
  if (catalog > 0) lines.push(`1 proposta comercial com ${catalog} ${catalog > 1 ? "itens" : "item"} (valor de tabela e negociado preservados).`);
  if (subscriptions > 0) lines.push(`${subscriptions} assinatura${subscriptions > 1 ? "s" : ""} do jornal em "pendente de formalização" (sem ativação e sem cobrança).`);
  return lines;
}
