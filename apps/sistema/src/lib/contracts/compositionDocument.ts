import { createHash } from "node:crypto";
import { resolveTemplateVariables } from "@ir/core";
import type { Client, CommercialChannel, ContractTemplate, ContractTemplateModality } from "@ir/types";
import {
  buildNegotiationRecord,
  buildNumberedServiceClauses,
  checkTemplateForComposition,
  compositionTotals,
  composeDocumentText,
  formatMoney,
  renderCompositionContent,
  validateCompositionServices,
  type CompositionServiceInput,
  type NegotiationRecordEntry,
} from "./contractComposition";
import { buildContracteeHeaderLines, type ContractorProfile } from "./contractorProfile";
import type { ContractTemplatePdfInput } from "./contractTemplatePdf";

/**
 * Monta a MINUTA de uma contratação (Etapa 2 de Contratos, 08/11/2026):
 * valida os serviços, confere o modelo (modalidade, estado, documento de
 * texto), recalcula no SERVIDOR o preço de tabela dos itens do catálogo (o
 * navegador nunca decide o preço original), renderiza o modelo com os dados
 * do cadastro mestre + CONTRATADA da Etapa 1, e gera o PDF com cabeçalho
 * CONTRATADA/CONTRATANTE e marca visível. NÃO persiste nada, NÃO assina,
 * NÃO cobra, NÃO ativa modelo. Dependências injetáveis → testável sem rede.
 */

export interface CatalogProduct {
  id: string;
  name: string;
  channel: CommercialChannel;
  suggestedPrice?: number;
  active: boolean;
}

export interface CompositionDeps {
  loadClient: (id: string) => Promise<Client | null>;
  loadTemplate: (id: string) => Promise<ContractTemplate | null>;
  loadProducts: (ids: string[]) => Promise<CatalogProduct[]>;
  loadContractor: (todayIso: string, preferredRepresentativeId?: string) => Promise<ContractorProfile>;
  /** Permissão específica de negociação (`publicidade.valores_negociar`), exigida quando algum valor difere da tabela. */
  canNegotiateValues: () => Promise<boolean>;
  buildPdf: (input: ContractTemplatePdfInput) => Promise<Uint8Array>;
  now: () => Date;
}

export interface CompositionRequest {
  clientId: string;
  modality: ContractTemplateModality;
  templateId: string;
  /** Representante legal escolhido para a CONTRATADA (vigência/poderes conferidos aqui). */
  representativeId?: string;
  services: CompositionServiceInput[];
  /** Valores dos campos variáveis ADICIONAIS declarados no modelo (os automáticos nunca vêm daqui). */
  customValues?: Record<string, string>;
}

export type CompositionDocumentResult =
  | { ok: false; error: string }
  | {
      ok: true;
      pdf: Uint8Array;
      sha256: string;
      marking: string;
      stage: "test" | "production";
      template: { id: string; title: string; version: number; groupId: string };
      services: CompositionServiceInput[];
      totals: { listTotal: number; negotiatedTotal: number; adjustmentAmount: number };
      negotiation: NegotiationRecordEntry[];
      pendencies: string[];
      notices: string[];
      contractorConfigured: boolean;
      fileName: string;
    };

const CONTRACTOR_LABELS: Record<string, string> = {
  "contratada.razao_social": "razão social da contratada",
  "contratada.cnpj": "CNPJ da contratada",
  "contratada.endereco": "endereço da contratada",
  "contratada.representante": "representante legal da contratada",
};

const AUTO_LABELS: Record<string, string> = {
  "cliente.nome": "nome do cliente",
  "cliente.cpf_cnpj": "CPF/CNPJ do cliente",
  "cliente.endereco": "endereço do cliente",
  "cliente.representante": "representante do cliente",
  "cliente.contato": "contato do cliente",
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function buildCompositionDocument(request: CompositionRequest, deps: CompositionDeps): Promise<CompositionDocumentResult> {
  const validation = validateCompositionServices(request.services);
  if (!validation.ok) return { ok: false, error: validation.errors.join(" ") };

  const template = await deps.loadTemplate(request.templateId);
  if (!template) return { ok: false, error: "Modelo de contrato não encontrado." };
  const check = checkTemplateForComposition(template, request.modality);
  if (!check.ok) return { ok: false, error: `Modelo "${template.title}": ${check.reason}` };

  const client = await deps.loadClient(request.clientId);
  if (!client) return { ok: false, error: "Cliente não encontrado no cadastro único." };

  // O preço de TABELA dos itens do catálogo vem do cadastro, nunca do navegador.
  const catalogIds = [...new Set(validation.services.filter((s) => s.kind === "catalog").map((s) => s.productId as string))];
  const products = catalogIds.length ? await deps.loadProducts(catalogIds) : [];
  const productMap = new Map(products.map((product) => [product.id, product]));
  const services: CompositionServiceInput[] = [];
  for (const [index, service] of validation.services.entries()) {
    if (service.kind !== "catalog") {
      services.push(service);
      continue;
    }
    const product = productMap.get(service.productId as string);
    if (!product || !product.active) {
      return { ok: false, error: `Serviço ${index + 1}: produto do catálogo inexistente ou inativo.` };
    }
    const listUnitPrice = typeof product.suggestedPrice === "number" ? product.suggestedPrice : service.listUnitPrice;
    const isNegotiated = Math.round(listUnitPrice * 100) !== Math.round(service.negotiatedUnitPrice * 100);
    if (isNegotiated && !service.negotiationReason) {
      return { ok: false, error: `Serviço ${index + 1}: informe a justificativa do valor negociado.` };
    }
    services.push({ ...service, listUnitPrice, channel: product.channel });
  }

  const now = deps.now();
  const today = isoDay(now);
  const negotiatedItems = buildNegotiationRecord(services);
  if (negotiatedItems.length > 0 && !(await deps.canNegotiateValues())) {
    return { ok: false, error: "Você não tem permissão para negociar valores acima/abaixo da tabela (permissão \"Negociar valores\"). Use os valores de tabela." };
  }
  const contractor = await deps.loadContractor(today, request.representativeId);
  if (contractor.preferredInvalid) return { ok: false, error: contractor.preferredInvalid };
  const totals = compositionTotals(services);
  const starts = services.map((s) => s.startsOn).sort();
  const ends = services.map((s) => s.endsOn).sort();

  const auto = resolveTemplateVariables({
    content: "",
    variables: [],
    client,
    contract: {
      contractNumber: "MINUTA",
      reference: `MINUTA-${today.replace(/-/g, "")}`,
      object: services.map((s) => s.title).join("; "),
      contractedAmount: totals.negotiatedTotal,
      startsAt: starts[0],
      endsAt: ends[ends.length - 1],
    },
    customValues: {},
    generatedAt: now,
  }).fieldValues;

  const declared = template.variables ?? [];
  const values: Record<string, string> = {};
  const labels: Record<string, string> = { ...AUTO_LABELS, ...CONTRACTOR_LABELS };
  for (const variable of declared) {
    labels[variable.key] = variable.label || variable.key;
    const custom = request.customValues?.[variable.key];
    if (typeof custom === "string" && custom.trim() && !(variable.key in auto)) values[variable.key] = custom.trim();
  }
  // Cadastro mestre e configurações da empresa prevalecem sobre texto livre.
  Object.assign(values, auto, contractor.variables, {
    "venda.valor": formatMoney(totals.negotiatedTotal),
    "venda.referencia": `MINUTA-${today.replace(/-/g, "")}`,
  });

  const clausesText = buildNumberedServiceClauses(services);
  const rendered = renderCompositionContent({ content: template.content, values, labels, clausesText });
  const notices = [...rendered.notices, ...contractor.warnings];
  const text = composeDocumentText(rendered, check.marking);

  const title = `Minuta — ${template.title}`.slice(0, 90);
  const pdf = await deps.buildPdf({
    title,
    content: text,
    contractReference: `MINUTA-${today.replace(/-/g, "")}`,
    templateTitle: template.title,
    templateVersion: template.version,
    generatedAt: now.toISOString(),
    parties: { contractor: contractor.headerLines, contractee: buildContracteeHeaderLines(values) },
    watermark: check.marking,
  });

  return {
    ok: true,
    pdf,
    sha256: createHash("sha256").update(pdf).digest("hex"),
    marking: check.marking,
    stage: check.stage,
    template: { id: template.id, title: template.title, version: template.version, groupId: template.groupId },
    services,
    totals,
    negotiation: buildNegotiationRecord(services),
    pendencies: rendered.pendencies,
    notices,
    contractorConfigured: contractor.configured,
    fileName: `minuta-${check.stage === "test" ? "teste" : "conferencia"}-${today}.pdf`,
  };
}
