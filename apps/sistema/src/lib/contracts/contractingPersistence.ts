import { contractTemplateStage, type ContractTemplate, type ContractTemplateModality } from "@ir/types";
import type { CatalogProduct } from "./compositionDocument";
import {
  buildNegotiationRecord,
  compositionTotals,
  computeServiceTotals,
  formatDateBr,
  formatNegotiationNote,
  validateCompositionServices,
  type CompositionServiceInput,
  type NegotiationRecordEntry,
} from "./contractComposition";
import type { ContractorProfile } from "./contractorProfile";

/**
 * Persistência da contratação montada (Etapa 2, pendências funcionais,
 * 08/11/2026). Reaproveita os cadastros EXISTENTES, sem estrutura paralela:
 *  - serviços do catálogo E serviços avulsos → proposta comercial (itens com tabela
 *    + negociado; o avulso é item sem `product_id`, descrição como snapshot);
 *  - assinatura do jornal → `subscriptions` em "pendente de formalização"
 *    (nunca ativa, nunca gera título/cobrança), com referência ESTRUTURADA
 *    (composition_request_id + composition_item_index, único no banco);
 *  - modalidade Institucional → contrato institucional com a lista de serviços
 *    em `extra_data` (nada de cobrança/assinatura/documento).
 * Idempotente: o mesmo `requestId` nunca cria duas vezes. Modelo em TESTE nunca
 * é vinculado (só modelo em produção); minuta de teste segue efêmera.
 * Dependências injetáveis → testável sem rede.
 */

export type PermissionKind = "proposal" | "subscription" | "institutional_contract" | "negotiate";

export interface ContractingRequest {
  requestId: string;
  clientId: string;
  modality: ContractTemplateModality;
  templateId?: string;
  representativeId?: string;
  services: CompositionServiceInput[];
}

export interface CreatedRecord {
  id: string;
  reference: string;
  /** false = já existia para este requestId (retry/clique duplo): nada foi duplicado. */
  created: boolean;
}

export interface ProposalCreateInput {
  requestId: string;
  clientId: string;
  contractTemplateId?: string;
  contractModality: ContractTemplateModality;
  contractorRepresentativeId?: string;
  notes: string;
  internalNotes?: string;
  items: Array<{
    /** Ausente em serviço avulso (sem cadastro de catálogo). */
    productId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    listUnitPrice: number;
    negotiationReason?: string;
  }>;
}

export interface SubscriptionCreateInput {
  requestId: string;
  itemIndex: number;
  clientId: string;
  serviceType: "impresso" | "digital";
  amount: number;
  periodicity: "monthly" | "quarterly" | "semiannual" | "annual";
  startsAt: string;
  endsAt?: string;
  copies?: number;
  notes: string;
}

export interface ContractCreateInput {
  requestId: string;
  clientId: string;
  object: string;
  contractedAmount: number;
  startsAt: string;
  endsAt: string;
  notes: string;
  extraData: Record<string, unknown>;
}

export interface ContractingDeps {
  checkPermission: (kind: PermissionKind) => Promise<string | null>;
  loadProducts: (ids: string[]) => Promise<CatalogProduct[]>;
  loadTemplate: (id: string) => Promise<ContractTemplate | null>;
  loadContractor: (todayIso: string, preferredRepresentativeId?: string) => Promise<ContractorProfile>;
  actorName: () => Promise<string>;
  findProposal: (requestId: string) => Promise<{ id: string; reference: string } | null>;
  createProposal: (input: ProposalCreateInput) => Promise<{ id: string; reference: string }>;
  findSubscription: (requestId: string, itemIndex: number) => Promise<{ id: string; reference: string } | null>;
  createSubscription: (input: SubscriptionCreateInput) => Promise<{ id: string; reference: string }>;
  findContract: (requestId: string) => Promise<{ id: string; reference: string } | null>;
  createContract: (input: ContractCreateInput) => Promise<{ id: string; reference: string }>;
  audit: (entityType: string, entityId: string, action: string, metadata: Record<string, unknown>) => Promise<void>;
  now: () => Date;
}

export interface ContractingOutcome {
  proposal?: CreatedRecord;
  subscriptions: CreatedRecord[];
  contract?: CreatedRecord;
  notices: string[];
  negotiation: NegotiationRecordEntry[];
}

export type ContractingResult =
  | ({ ok: true } & ContractingOutcome)
  | ({ ok: false; error: string } & Partial<ContractingOutcome>);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cria; se a criação falhar porque outra requisição (retry, clique duplo, outra aba)
 * já criou o mesmo registro, devolve o existente em vez de duplicar ou falhar.
 * A garantia final é o índice único no banco.
 */
async function createOrExisting(
  create: () => Promise<{ id: string; reference: string }>,
  find: () => Promise<{ id: string; reference: string } | null>,
): Promise<CreatedRecord> {
  try {
    return { ...(await create()), created: true };
  } catch (error) {
    const existing = await find().catch(() => null);
    if (existing) return { ...existing, created: false };
    throw error;
  }
}

export async function persistContracting(request: ContractingRequest, deps: ContractingDeps): Promise<ContractingResult> {
  if (!UUID_RE.test(request.requestId)) return { ok: false, error: "Identificador da contratação inválido. Recarregue a página." };
  if (!request.clientId) return { ok: false, error: "Selecione o cliente." };
  if (request.modality !== "commercial" && request.modality !== "institutional") return { ok: false, error: "Modalidade inválida." };

  const validation = validateCompositionServices(request.services);
  if (!validation.ok) return { ok: false, error: validation.errors.join(" ") };

  const outcome: ContractingOutcome = { subscriptions: [], notices: [], negotiation: [] };
  const fail = (error: string): ContractingResult => ({ ok: false, error, ...outcome });

  // O preço de TABELA dos itens do catálogo vem do cadastro (servidor), nunca do navegador.
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
    if (!product || !product.active) return { ok: false, error: `Serviço ${index + 1}: produto do catálogo inexistente ou inativo.` };
    const listUnitPrice = typeof product.suggestedPrice === "number" ? product.suggestedPrice : service.listUnitPrice;
    if (Math.round(listUnitPrice * 100) !== Math.round(service.negotiatedUnitPrice * 100) && !service.negotiationReason) {
      return { ok: false, error: `Serviço ${index + 1}: informe a justificativa do valor negociado.` };
    }
    services.push({ ...service, listUnitPrice, channel: product.channel });
  }

  outcome.negotiation = buildNegotiationRecord(services);
  if (outcome.negotiation.length > 0) {
    const denied = await deps.checkPermission("negotiate");
    if (denied) return { ok: false, error: "Você não tem permissão para negociar valores acima/abaixo da tabela (permissão \"Negociar valores\"). Use os valores de tabela." };
  }

  // Modelo: só modelo em PRODUÇÃO é vinculado à contratação; teste/rascunho nunca viram vínculo real.
  let templateId: string | undefined;
  if (request.templateId) {
    const template = await deps.loadTemplate(request.templateId);
    if (!template) return { ok: false, error: "Modelo de contrato não encontrado." };
    if (template.modality !== request.modality) return { ok: false, error: `Modelo "${template.title}": modalidade diferente da escolhida.` };
    if (contractTemplateStage(template) === "production") {
      templateId = template.id;
    } else {
      outcome.notices.push(
        `O modelo "${template.title}" ainda não está em produção: ele NÃO foi vinculado à contratação (serve só para minuta). Vincule um modelo em produção quando aprovado.`,
      );
    }
  }

  const today = deps.now().toISOString().slice(0, 10);
  let representativeId: string | undefined;
  if (request.representativeId) {
    const contractor = await deps.loadContractor(today, request.representativeId);
    if (contractor.preferredInvalid) return { ok: false, error: contractor.preferredInvalid };
    representativeId = request.representativeId;
    if (!contractor.configured) outcome.notices.push("Dados da empresa (contratada) ainda não cadastrados: o representante foi registrado, mas o cabeçalho depende desse cadastro.");
    outcome.notices.push(...contractor.warnings);
  }

  const actorName = await deps.actorName();
  const atIso = deps.now().toISOString();
  const totals = compositionTotals(services);

  try {
    if (request.modality === "commercial") {
      // Catálogo E avulso viram itens da MESMA proposta (o avulso sem product_id).
      const catalogServices = services.filter((service) => service.kind === "catalog" || service.kind === "other");
      const subscriptionServices = services.map((service, index) => ({ service, index })).filter(({ service }) => service.kind === "subscription");

      if (catalogServices.length > 0) {
        const denied = await deps.checkPermission("proposal");
        if (denied) return fail(denied);
      }
      if (subscriptionServices.length > 0) {
        const denied = await deps.checkPermission("subscription");
        if (denied) return fail(denied);
      }

      if (catalogServices.length > 0) {
        const existing = await deps.findProposal(request.requestId);
        if (existing) {
          outcome.proposal = { ...existing, created: false };
        } else {
          const created = await createOrExisting(() => deps.createProposal({
            requestId: request.requestId,
            clientId: request.clientId,
            contractTemplateId: templateId,
            contractModality: request.modality,
            contractorRepresentativeId: representativeId,
            notes: `Montada em "Montagem de contratação". Vigências propostas por serviço:\n${catalogServices
              .map((service) => `${service.title}: ${formatDateBr(service.startsOn)} a ${formatDateBr(service.endsOn)}`)
              .join("\n")}`,
            internalNotes: formatNegotiationNote(buildNegotiationRecord(catalogServices), actorName, atIso) || undefined,
            items: catalogServices.map((service) => ({
              productId: service.kind === "catalog" ? (service.productId as string) : undefined,
              description: service.title.slice(0, 200),
              quantity: service.quantity,
              // unit_price = valor NEGOCIADO (menor OU maior que a tabela); a tabela fica em list_unit_price.
              unitPrice: service.negotiatedUnitPrice,
              discountAmount: 0,
              listUnitPrice: service.listUnitPrice,
              negotiationReason: computeServiceTotals(service).isNegotiated ? service.negotiationReason : undefined,
            })),
          }), () => deps.findProposal(request.requestId));
          outcome.proposal = created;
          if (created.created) await deps.audit("commercial_proposal", created.id, "create", {
            reference: created.reference, via: "montagem_de_contratacao", requestId: request.requestId,
            itemCount: catalogServices.length, templateId: templateId ?? null, representativeId: representativeId ?? null,
          });
          const catalogNegotiation = buildNegotiationRecord(catalogServices);
          if (created.created && catalogNegotiation.length > 0) {
            await deps.audit("commercial_proposal", created.id, "negotiated_values_recorded", { context: "proposta", entries: catalogNegotiation });
          }
        }
      }

      for (const { service, index } of subscriptionServices) {
        const existing = await deps.findSubscription(request.requestId, index);
        if (existing) {
          outcome.subscriptions.push({ ...existing, created: false });
          continue;
        }
        const totalsOfService = computeServiceTotals(service);
        const created = await createOrExisting(() => deps.createSubscription({
          requestId: request.requestId,
          itemIndex: index,
          clientId: request.clientId,
          serviceType: service.subscriptionServiceType ?? "impresso",
          amount: totalsOfService.negotiatedTotal,
          periodicity: service.periodicity as "monthly" | "quarterly" | "semiannual" | "annual",
          startsAt: service.startsOn,
          endsAt: service.endsOn,
          copies: service.subscriptionServiceType === "digital" ? undefined : service.copies ?? Math.max(1, Math.floor(service.quantity)),
          notes: [
            `Criada na montagem de contratação em ${new Date(atIso).toLocaleDateString("pt-BR")} por ${actorName}. Pendente de formalização: nenhuma cobrança ou ativação foi gerada.`,
            totalsOfService.isNegotiated
              ? `Valor de tabela ${totalsOfService.listTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} → negociado ${totalsOfService.negotiatedTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Justificativa: ${service.negotiationReason ?? "—"}`
              : "",
          ].filter(Boolean).join("\n"),
        }), () => deps.findSubscription(request.requestId, index));
        outcome.subscriptions.push(created);
        if (!created.created) continue;
        await deps.audit("subscription", created.id, "create", {
          reference: created.reference, via: "montagem_de_contratacao", requestId: request.requestId, itemIndex: index, status: "pending_formalization",
        });
        const subscriptionNegotiation = buildNegotiationRecord([service]);
        if (subscriptionNegotiation.length > 0) {
          await deps.audit("subscription", created.id, "negotiated_values_recorded", { context: "assinatura", entries: subscriptionNegotiation });
        }
      }
    } else {
      const denied = await deps.checkPermission("institutional_contract");
      if (denied) return fail(denied);
      const existing = await deps.findContract(request.requestId);
      if (existing) {
        outcome.contract = { ...existing, created: false };
      } else {
        const starts = services.map((service) => service.startsOn).sort();
        const ends = services.map((service) => service.endsOn).sort();
        const created = await deps.createContract({
          requestId: request.requestId,
          clientId: request.clientId,
          object: `${services.length} serviço${services.length > 1 ? "s" : ""}: ${services.map((service) => service.title).join("; ")}`.slice(0, 1000),
          contractedAmount: totals.negotiatedTotal,
          startsAt: starts[0],
          endsAt: ends[ends.length - 1],
          notes: `Criado na montagem de contratação em ${new Date(atIso).toLocaleDateString("pt-BR")} por ${actorName}. Nenhuma cobrança, assinatura ou documento foi gerado.`,
          extraData: {
            compositionRequestId: request.requestId,
            templateId: templateId ?? null,
            representativeId: representativeId ?? null,
            totals,
            services: services.map((service) => ({
              kind: service.kind,
              productId: service.productId ?? null,
              title: service.title,
              channel: service.channel ?? null,
              description: service.description ?? null,
              quantity: service.quantity,
              listUnitPrice: service.listUnitPrice,
              negotiatedUnitPrice: service.negotiatedUnitPrice,
              negotiationReason: service.negotiationReason ?? null,
              startsOn: service.startsOn,
              endsOn: service.endsOn,
              periodicity: service.periodicity ?? null,
              subscriptionServiceType: service.subscriptionServiceType ?? null,
              copies: service.copies ?? null,
              deliveryNote: service.deliveryNote ?? null,
              renewalNote: service.renewalNote ?? null,
              terminationNote: service.terminationNote ?? null,
            })),
          },
        });
        outcome.contract = { ...created, created: true };
        await deps.audit("institutional_contract", created.id, "create", {
          reference: created.reference, via: "montagem_de_contratacao", requestId: request.requestId,
          serviceCount: services.length, templateId: templateId ?? null, representativeId: representativeId ?? null,
        });
        if (outcome.negotiation.length > 0) {
          await deps.audit("institutional_contract", created.id, "negotiated_values_recorded", { context: "contrato", entries: outcome.negotiation });
        }
      }
    }
  } catch (error) {
    return fail(
      `${error instanceof Error ? error.message : "Falha ao salvar a contratação."} O que já foi criado não será duplicado ao tentar de novo.`,
    );
  }

  return { ok: true, ...outcome };
}
