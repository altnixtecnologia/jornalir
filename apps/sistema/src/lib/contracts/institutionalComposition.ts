import {
  buildNumberedServiceClauses,
  validateCompositionServices,
  type CompositionServiceInput,
} from "./contractComposition";
import type { ContractorProfile } from "./contractorProfile";

/**
 * Contrato institucional com MÚLTIPLOS serviços (Etapa 2, pendências
 * funcionais). A montagem de contratação grava a lista estruturada em
 * `institutional_contracts.extra_data` (sem tabela nova); aqui ela é lida de
 * volta para a GERAÇÃO do documento a partir de modelo: cláusulas 2.1, 2.2…,
 * CONTRATADA da Etapa 1 (com o representante ESCOLHIDO, vigência conferida) e
 * cabeçalho CONTRATADA/CONTRATANTE. Puro e testável.
 */

export interface InstitutionalComposition {
  services: CompositionServiceInput[];
  representativeId?: string;
  templateId?: string;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
function num(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

/** Lê e REVALIDA `extra_data.services`; dado ausente/inválido → null (o fluxo anterior segue idêntico). */
export function readCompositionFromExtraData(extraData: Record<string, unknown> | undefined | null): InstitutionalComposition | null {
  const raw = extraData?.services;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const services = raw.map((item): CompositionServiceInput => {
    const entry = (item ?? {}) as Record<string, unknown>;
    return {
      kind: (text(entry.kind) ?? "other") as CompositionServiceInput["kind"],
      productId: text(entry.productId),
      title: text(entry.title) ?? "",
      channel: text(entry.channel),
      description: text(entry.description),
      quantity: num(entry.quantity),
      listUnitPrice: num(entry.listUnitPrice),
      negotiatedUnitPrice: num(entry.negotiatedUnitPrice),
      negotiationReason: text(entry.negotiationReason),
      startsOn: text(entry.startsOn) ?? "",
      endsOn: text(entry.endsOn) ?? "",
      periodicity: text(entry.periodicity) as CompositionServiceInput["periodicity"],
      subscriptionServiceType: text(entry.subscriptionServiceType) as CompositionServiceInput["subscriptionServiceType"],
      copies: typeof entry.copies === "number" ? entry.copies : undefined,
      deliveryNote: text(entry.deliveryNote),
      renewalNote: text(entry.renewalNote),
      terminationNote: text(entry.terminationNote),
    };
  });
  // Serviços institucionais "outro/avulso" não têm catálogo: o productId só é exigido para kind=catalog.
  const validation = validateCompositionServices(services);
  if (!validation.ok) return null;
  return { services: validation.services, representativeId: text(extraData?.representativeId), templateId: text(extraData?.templateId) };
}

/** Variáveis automáticas desta composição (sempre as da contratada configurada + as cláusulas). */
export function institutionalCompositionValues(composition: InstitutionalComposition, contractor: ContractorProfile): Record<string, string> {
  const clauses = buildNumberedServiceClauses(composition.services);
  return { ...contractor.variables, "servicos.clausulas": clauses, "servicos.resumo": clauses };
}

/**
 * Pós-processa o conteúdo JÁ resolvido pelo modelo: troca os marcadores que o
 * resolvedor padrão não conhece e, se o modelo não usa `{{servicos.clausulas}}`
 * nem `{{servicos.resumo}}`, acrescenta o bloco 2.x ao final (com aviso).
 */
export function finalizeInstitutionalContent(
  templateContent: string,
  resolvedContent: string,
  values: Record<string, string>,
): { content: string; appendedClauses: boolean } {
  let content = resolvedContent;
  for (const [key, value] of Object.entries(values)) {
    content = content.split(`{{${key}}}`).join(value);
  }
  const usesClauses = /\{\{\s*servicos\.(clausulas|resumo)\s*\}\}/.test(templateContent);
  if (usesClauses) return { content, appendedClauses: false };
  return { content: `${content.trimEnd()}\n\n${values["servicos.clausulas"]}`, appendedClauses: true };
}
