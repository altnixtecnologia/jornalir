import {
  CONTRACT_TEMPLATE_TEST_BANNER,
  contractTemplateStage,
  type ContractTemplate,
  type ContractTemplateModality,
} from "@ir/types";

/**
 * Montagem de contratação (Etapa 2 de Contratos, 08/11/2026): vários serviços
 * no MESMO documento, valores negociados por item com preço original e
 * justificativa preservados, cláusulas numeradas 2.1, 2.2… com vigência e
 * valor independentes. Puro (sem rede/banco) e testável; não persiste nada,
 * não assina, não cobra.
 */

export const COMPOSITION_PERIODICITIES = ["single", "monthly", "quarterly", "semiannual", "annual"] as const;
export type CompositionPeriodicity = (typeof COMPOSITION_PERIODICITIES)[number];

export const PERIODICITY_LABELS: Record<CompositionPeriodicity, string> = {
  single: "Pagamento/entrega única",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

/** catalog = produto do catálogo comercial (preço de tabela vem do cadastro); subscription = assinatura do jornal; other = serviço avulso. */
export type CompositionServiceKind = "catalog" | "subscription" | "other";

export const SERVICE_KIND_LABELS: Record<CompositionServiceKind, string> = {
  catalog: "Publicidade / produto do catálogo",
  subscription: "Assinatura do jornal",
  other: "Outro serviço",
};

export const CHANNEL_LABELS: Record<string, string> = {
  newspaper: "Publicidade no jornal impresso",
  website: "Publicidade no site",
  led_panel: "Publicidade em painel LED",
  equipment_rental: "Locação de equipamento",
};

export interface CompositionServiceInput {
  kind: CompositionServiceKind;
  /** Produto do catálogo (só kind=catalog). */
  productId?: string;
  title: string;
  /** Canal do catálogo (newspaper, led_panel…). */
  channel?: string;
  description?: string;
  quantity: number;
  /** Preço de TABELA no momento da montagem — nunca alterado pelo valor negociado. */
  listUnitPrice: number;
  negotiatedUnitPrice: number;
  /** Obrigatória sempre que o negociado difere do tabelado. */
  negotiationReason?: string;
  /** yyyy-mm-dd */
  startsOn: string;
  endsOn: string;
  /** Opcional: serviços vindos do snapshot da venda não têm periodicidade e a cláusula omite a linha. */
  periodicity?: CompositionPeriodicity;
  deliveryNote?: string;
  renewalNote?: string;
  terminationNote?: string;
}

export interface CompositionServiceTotals {
  listTotal: number;
  negotiatedTotal: number;
  /** Positivo = desconto; negativo = acréscimo sobre a tabela. */
  adjustmentAmount: number;
  adjustmentPercent: number;
  isNegotiated: boolean;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateBr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "PENDENTE";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function computeServiceTotals(service: Pick<CompositionServiceInput, "quantity" | "listUnitPrice" | "negotiatedUnitPrice">): CompositionServiceTotals {
  const listTotal = roundMoney(service.listUnitPrice * service.quantity);
  const negotiatedTotal = roundMoney(service.negotiatedUnitPrice * service.quantity);
  const adjustmentAmount = roundMoney(listTotal - negotiatedTotal);
  return {
    listTotal,
    negotiatedTotal,
    adjustmentAmount,
    adjustmentPercent: listTotal > 0 ? roundMoney((adjustmentAmount / listTotal) * 100) : 0,
    isNegotiated: roundMoney(service.listUnitPrice) !== roundMoney(service.negotiatedUnitPrice),
  };
}

export function compositionTotals(services: CompositionServiceInput[]): { listTotal: number; negotiatedTotal: number; adjustmentAmount: number } {
  const totals = services.map(computeServiceTotals);
  const listTotal = roundMoney(totals.reduce((sum, item) => sum + item.listTotal, 0));
  const negotiatedTotal = roundMoney(totals.reduce((sum, item) => sum + item.negotiatedTotal, 0));
  return { listTotal, negotiatedTotal, adjustmentAmount: roundMoney(listTotal - negotiatedTotal) };
}

const MAX_SERVICES = 30;

export type CompositionValidation =
  | { ok: true; services: CompositionServiceInput[] }
  | { ok: false; errors: string[] };

/** Valida e normaliza (trim). Os erros citam o serviço pelo número, nunca um erro genérico. */
export function validateCompositionServices(input: CompositionServiceInput[]): CompositionValidation {
  const errors: string[] = [];
  if (!Array.isArray(input) || input.length === 0) return { ok: false, errors: ["Inclua pelo menos um serviço."] };
  if (input.length > MAX_SERVICES) return { ok: false, errors: [`No máximo ${MAX_SERVICES} serviços por documento.`] };

  const services = input.map((raw, index): CompositionServiceInput => {
    const n = index + 1;
    const label = `Serviço ${n}`;
    const title = (raw.title ?? "").replace(/\s+/g, " ").trim();
    if (title.length < 3 || title.length > 160) errors.push(`${label}: informe o título (3 a 160 caracteres).`);
    if (!["catalog", "subscription", "other"].includes(raw.kind)) errors.push(`${label}: tipo de serviço inválido.`);
    if (raw.kind === "catalog" && !raw.productId) errors.push(`${label}: selecione o produto do catálogo.`);
    if (!Number.isFinite(raw.quantity) || raw.quantity <= 0 || raw.quantity > 100000) errors.push(`${label}: quantidade inválida.`);
    if (!Number.isFinite(raw.listUnitPrice) || raw.listUnitPrice < 0) errors.push(`${label}: valor de tabela inválido.`);
    if (!Number.isFinite(raw.negotiatedUnitPrice) || raw.negotiatedUnitPrice < 0) errors.push(`${label}: valor negociado inválido.`);
    const reason = (raw.negotiationReason ?? "").replace(/\s+/g, " ").trim();
    if (
      Number.isFinite(raw.listUnitPrice) && Number.isFinite(raw.negotiatedUnitPrice)
      && roundMoney(raw.listUnitPrice) !== roundMoney(raw.negotiatedUnitPrice) && reason.length < 5
    ) {
      errors.push(`${label}: informe a justificativa do valor negociado (mínimo 5 caracteres).`);
    }
    if (!validIsoDate(raw.startsOn)) errors.push(`${label}: data de início inválida.`);
    if (!validIsoDate(raw.endsOn)) errors.push(`${label}: data de término inválida.`);
    if (validIsoDate(raw.startsOn) && validIsoDate(raw.endsOn) && raw.endsOn < raw.startsOn) {
      errors.push(`${label}: o término é anterior ao início.`);
    }
    if (raw.periodicity !== undefined && !COMPOSITION_PERIODICITIES.includes(raw.periodicity)) errors.push(`${label}: periodicidade inválida.`);
    const clip = (value: string | undefined, max: number, field: string): string | undefined => {
      const cleaned = (value ?? "").replace(/[ \t]+/g, " ").trim();
      if (cleaned.length > max) errors.push(`${label}: ${field} acima de ${max} caracteres.`);
      return cleaned || undefined;
    };
    return {
      kind: raw.kind,
      productId: raw.productId || undefined,
      title,
      channel: raw.channel?.trim() || undefined,
      description: clip(raw.description, 1000, "descrição"),
      quantity: raw.quantity,
      listUnitPrice: raw.listUnitPrice,
      negotiatedUnitPrice: raw.negotiatedUnitPrice,
      negotiationReason: reason || undefined,
      startsOn: raw.startsOn,
      endsOn: raw.endsOn,
      periodicity: raw.periodicity,
      deliveryNote: clip(raw.deliveryNote, 500, "entrega/veiculação"),
      renewalNote: clip(raw.renewalNote, 500, "renovação"),
      terminationNote: clip(raw.terminationNote, 500, "encerramento"),
    };
  });
  return errors.length ? { ok: false, errors } : { ok: true, services };
}

function quantityText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR");
}

/**
 * "2. SERVIÇOS CONTRATADOS" com uma cláusula por serviço (2.1, 2.2…), cada
 * uma com descrição, quantidade, valor de tabela × negociado, periodicidade,
 * vigência, entrega, renovação e encerramento PRÓPRIOS. Acaba com a cláusula
 * de independência: cancelar/encerrar um serviço não cancela os demais.
 */
export function buildNumberedServiceClauses(services: CompositionServiceInput[]): string {
  const blocks = services.map((service, index) => {
    const totals = computeServiceTotals(service);
    const channel = service.channel ? CHANNEL_LABELS[service.channel] ?? service.channel : SERVICE_KIND_LABELS[service.kind];
    const lines = [
      `2.${index + 1} ${service.title} — ${channel}`,
      ...(service.description ? [`Descrição: ${service.description}`] : []),
      `Quantidade: ${quantityText(service.quantity)}`,
      totals.isNegotiated
        ? `Valor unitário de tabela: ${formatMoney(service.listUnitPrice)} · Valor unitário negociado: ${formatMoney(service.negotiatedUnitPrice)}`
        : `Valor unitário: ${formatMoney(service.negotiatedUnitPrice)}`,
      `Valor total deste serviço: ${formatMoney(totals.negotiatedTotal)}${totals.isNegotiated ? ` (valor de tabela ${formatMoney(totals.listTotal)}; ${totals.adjustmentAmount >= 0 ? "desconto" : "acréscimo"} negociado de ${formatMoney(Math.abs(totals.adjustmentAmount))})` : ""}`,
      ...(totals.isNegotiated && service.negotiationReason ? [`Justificativa do valor negociado: ${service.negotiationReason}`] : []),
      ...(service.periodicity ? [`Periodicidade: ${PERIODICITY_LABELS[service.periodicity]}`] : []),
      `Vigência: ${formatDateBr(service.startsOn)} a ${formatDateBr(service.endsOn)}`,
      `Entrega/veiculação: ${service.deliveryNote ?? "Conforme especificação deste serviço."}`,
      `Renovação: ${service.renewalNote ?? "Sem renovação automática; depende de novo ajuste entre as partes."}`,
      `Encerramento: ${service.terminationNote ?? "Ao término da vigência acima ou por aditivo escrito entre as partes."}`,
    ];
    return lines.join("\n");
  });
  const totals = compositionTotals(services);
  return [
    "2. SERVIÇOS CONTRATADOS",
    ...blocks,
    `2.${services.length + 1} Valor total dos serviços: ${formatMoney(totals.negotiatedTotal)}.`,
    `2.${services.length + 2} Cada serviço acima tem vigência, valor e encerramento próprios. O cancelamento ou o encerramento de um serviço não cancela os demais automaticamente; alterações após a assinatura são feitas por aditivo versionado, sem sobrescrever o contrato original.`,
  ].join("\n\n");
}

/** Snapshot de um serviço da venda/contratação (commercial_contract_services) — só os campos usados nas cláusulas. */
export interface SaleServiceSnapshotInput {
  service_title: string;
  service_channel: string;
  source_snapshot: Record<string, unknown>;
  starts_on: string | null;
  ends_on: string | null;
  service_location: string | null;
  service_scope: string | null;
  execution_conditions: string | null;
}

/**
 * Converte os serviços já congelados da venda em serviços da composição, para
 * numerar as cláusulas 2.x do documento OFICIAL com os MESMOS valores do
 * snapshot (preço original = unitPrice, negociado = total ÷ quantidade).
 * Nunca recalcula nem altera o snapshot; dado ausente vira texto explícito.
 */
export function servicesFromSaleSnapshots(entries: SaleServiceSnapshotInput[]): CompositionServiceInput[] {
  return entries.map((entry) => {
    const snapshot = entry.source_snapshot ?? {};
    const quantity = typeof snapshot.quantity === "number" && snapshot.quantity > 0 ? snapshot.quantity : 1;
    const unitPrice = typeof snapshot.unitPrice === "number" && Number.isFinite(snapshot.unitPrice) ? snapshot.unitPrice : 0;
    const total = typeof snapshot.totalAmount === "number" && Number.isFinite(snapshot.totalAmount) ? snapshot.totalAmount : unitPrice * quantity;
    const negotiatedUnit = roundMoney(total / quantity);
    const delivery = [entry.service_location ? `Local: ${entry.service_location}` : "", entry.execution_conditions ?? ""].filter(Boolean).join(". ");
    return {
      kind: "catalog",
      title: entry.service_title,
      channel: entry.service_channel,
      description: entry.service_scope ?? undefined,
      quantity,
      listUnitPrice: unitPrice,
      negotiatedUnitPrice: negotiatedUnit,
      negotiationReason: roundMoney(unitPrice) !== negotiatedUnit ? "Valor conforme proposta aprovada." : undefined,
      startsOn: entry.starts_on ?? "",
      endsOn: entry.ends_on ?? "",
      deliveryNote: delivery || undefined,
    } satisfies CompositionServiceInput;
  });
}

export interface NegotiationRecordEntry {
  title: string;
  kind: CompositionServiceKind;
  productId?: string;
  quantity: number;
  listUnitPrice: number;
  negotiatedUnitPrice: number;
  adjustmentAmount: number;
  adjustmentPercent: number;
  reason?: string;
}

/** Só os itens com valor diferente da tabela — histórico de negociação (auditoria + notas internas da proposta). */
export function buildNegotiationRecord(services: CompositionServiceInput[]): NegotiationRecordEntry[] {
  return services
    .map((service) => ({ service, totals: computeServiceTotals(service) }))
    .filter(({ totals }) => totals.isNegotiated)
    .map(({ service, totals }) => ({
      title: service.title,
      kind: service.kind,
      productId: service.productId,
      quantity: service.quantity,
      listUnitPrice: service.listUnitPrice,
      negotiatedUnitPrice: service.negotiatedUnitPrice,
      adjustmentAmount: totals.adjustmentAmount,
      adjustmentPercent: totals.adjustmentPercent,
      reason: service.negotiationReason,
    }));
}

export function formatNegotiationNote(entries: NegotiationRecordEntry[], actorName: string, atIso: string): string {
  if (entries.length === 0) return "";
  const at = new Date(atIso).toLocaleString("pt-BR");
  return [
    `Valores negociados na montagem da contratação — por ${actorName} em ${at}:`,
    ...entries.map(
      (entry) =>
        `- ${entry.title}: tabela ${formatMoney(entry.listUnitPrice)} → negociado ${formatMoney(entry.negotiatedUnitPrice)} (x${quantityText(entry.quantity)}; ${entry.adjustmentAmount >= 0 ? "desconto" : "acréscimo"} de ${formatMoney(Math.abs(entry.adjustmentAmount))}, ${Math.abs(entry.adjustmentPercent).toLocaleString("pt-BR")}%). Justificativa: ${entry.reason ?? "—"}`,
    ),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Modelo × marcação visível
// ---------------------------------------------------------------------------

export const CONFERENCE_BANNER = "MINUTA PARA CONFERÊNCIA — NÃO ASSINAR";

export type CompositionTemplateCheck =
  | { ok: true; marking: string; stage: "test" | "production" }
  | { ok: false; reason: string };

/**
 * Quais modelos podem gerar minuta aqui: só de TEXTO (documento fixo não
 * mescla variáveis), da modalidade escolhida e já habilitados para teste ou
 * em produção. Rascunho nunca gera. Minuta de modelo em teste leva a marca
 * "MINUTA DE TESTE — SEM EFEITO CONTRATUAL"; de modelo em produção, "MINUTA
 * PARA CONFERÊNCIA — NÃO ASSINAR". Nenhum modelo é ativado por gerar minuta.
 */
export function checkTemplateForComposition(template: ContractTemplate, modality: ContractTemplateModality): CompositionTemplateCheck {
  if (template.modality !== modality) {
    return { ok: false, reason: template.modality ? "Modalidade diferente da escolhida." : "Modalidade não definida no modelo." };
  }
  if (template.documentMode !== "text") {
    return { ok: false, reason: "Documento fixo em PDF não mescla variáveis — abra o PDF do modelo em Configurações." };
  }
  const stage = contractTemplateStage(template);
  if (stage === "draft") {
    return { ok: false, reason: "Rascunho: habilite o modelo para teste antes de gerar minuta." };
  }
  return { ok: true, stage, marking: stage === "test" ? CONTRACT_TEMPLATE_TEST_BANNER : CONFERENCE_BANNER };
}

// ---------------------------------------------------------------------------
// Renderização segura do modelo
// ---------------------------------------------------------------------------

export interface RenderedComposition {
  text: string;
  /** Campos que ficaram sem valor — aparecem como [PENDENTE: campo] no texto. */
  pendencies: string[];
  /** Avisos não bloqueantes (ex.: cláusulas 2.x acrescentadas ao final). */
  notices: string[];
}

/**
 * Troca literal de `{{chave}}` (nunca avalia expressão). Campo ausente/vazio
 * vira `[PENDENTE: rótulo]` e entra em `pendencies`. Se o modelo não usa
 * `{{servicos.clausulas}}`/`{{servicos.resumo}}`, o bloco 2.x é acrescentado
 * ao final (com aviso) — a minuta sempre discrimina os serviços.
 */
export function renderCompositionContent(input: {
  content: string;
  values: Record<string, string>;
  labels?: Record<string, string>;
  clausesText: string;
}): RenderedComposition {
  const pendencies = new Set<string>();
  const notices: string[] = [];
  const usesClauses = /\{\{\s*servicos\.(clausulas|resumo)\s*\}\}/.test(input.content);
  let content = input.content;
  if (!usesClauses) {
    content = `${content.trimEnd()}\n\n{{servicos.clausulas}}`;
    notices.push('O modelo não usa {{servicos.clausulas}}: o bloco "2. SERVIÇOS CONTRATADOS" foi acrescentado ao final da minuta.');
  }
  const values: Record<string, string> = { ...input.values, "servicos.clausulas": input.clausesText, "servicos.resumo": input.clausesText };
  const rendered = content.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
    if (typeof value === "string" && value.trim()) return value.trim();
    const label = input.labels?.[key] ?? key;
    pendencies.add(label);
    return `[PENDENTE: ${label}]`;
  });
  if (rendered.includes("{{") || rendered.includes("}}") || rendered.includes("{%") || rendered.includes("%}")) {
    pendencies.add("marcadores inválidos no modelo");
  }
  return { text: rendered, pendencies: [...pendencies], notices };
}

/** Texto do corpo do PDF: avisos de pendência no topo (visíveis) + conteúdo. */
export function composeDocumentText(rendered: RenderedComposition, marking: string): string {
  const header = [marking, "Documento gerado para conferência; não constitui contrato celebrado."];
  if (rendered.pendencies.length > 0) {
    header.push(`PENDÊNCIAS (${rendered.pendencies.length}): ${rendered.pendencies.join("; ")}.`);
  }
  return [header.join("\n"), rendered.text].join("\n\n");
}
