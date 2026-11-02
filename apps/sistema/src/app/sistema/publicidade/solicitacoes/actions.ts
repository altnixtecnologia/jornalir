"use server";

import { revalidatePath } from "next/cache";
import { isValidCnpj, isValidCpf } from "@ir/core";
import { getClientService } from "../../../../composition/clientes";
import { getSubscriptionService } from "../../../../composition/assinaturas";
import { getReceivableService } from "../../../../composition/financeiro";
import { getCommercialProposalService } from "../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../lib/permissions/checkModuleAction";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";
import {
  onlyDigits,
  todayInBrazil,
  addDaysIso,
  addYearsIso,
  advertisingSelections,
  subscriptionSelectionAmount,
  commercialConditionFromPayment,
  advertisingItemsTotal,
  approvedTotalDivergesFromItems,
} from "./siteInterestConversionHelpers";

export type SiteInterestStatus = "new" | "contacted" | "converted" | "discarded";
export type SiteInterestAvailability = "pending" | "approved" | "unavailable" | "needs_info";

const VALID_STATUSES: readonly SiteInterestStatus[] = ["new", "contacted", "converted", "discarded"];
const VALID_AVAILABILITY: readonly SiteInterestAvailability[] = ["pending", "approved", "unavailable", "needs_info"];

interface SubscriptionInterestRow {
  id: string;
  request_type: "subscription" | "advertising" | "mixed";
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  customer_kind: "individual" | "company" | null;
  document_number: string | null;
  selections: unknown;
  estimated_total: number | null;
  notes: string | null;
  status: SiteInterestStatus;
  payment_preference: "pix" | "boleto" | "credit_card" | "cash" | "to_define" | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  availability_status: SiteInterestAvailability;
  approved_total: number | null;
  admin_note: string | null;
  converted_client_id: string | null;
  converted_subscription_id: string | null;
  converted_receivable_id: string | null;
  converted_proposal_id: string | null;
}

export type ConvertSubscriptionInterestResult =
  | { error: string }
  | { ok: true; clientId: string; subscriptionId: string; receivableId: string };

function paths(): void {
  revalidatePath("/sistema/publicidade");
  revalidatePath("/sistema/publicidade/solicitacoes");
  revalidatePath("/sistema/notificacoes");
  revalidatePath("/sistema");
}

async function resolveOrCreateAdvertisingClient(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  row: SubscriptionInterestRow,
): Promise<string> {
  if (row.converted_client_id) return row.converted_client_id;

  const candidateIds = new Set<string>();
  const phone = onlyDigits(row.phone);
  const email = row.email?.trim().toLowerCase() || "";

  const addMatches = (matches: Array<{ id: string; status: string }> | null): void => {
    for (const match of matches ?? []) {
      if (match.status === "inactive") {
        throw new Error("Já existe um cadastro inativo com os dados desta solicitação. Reative o cadastro antes de converter.");
      }
      candidateIds.add(match.id);
    }
  };

  if (phone) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, status")
      .or(`whatsapp.eq.${phone},phone_primary.eq.${phone}`)
      .limit(3);
    if (error) throw new Error(error.message);
    addMatches(data as Array<{ id: string; status: string }> | null);
  }

  if (email) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, status")
      .ilike("email", email)
      .limit(3);
    if (error) throw new Error(error.message);
    addMatches(data as Array<{ id: string; status: string }> | null);
  }

  if (candidateIds.size > 1) {
    throw new Error("Telefone e e-mail apontam para cadastros diferentes. Confira os dados antes de converter.");
  }

  const existingId = [...candidateIds][0];
  if (existingId) {
    const current = await getClientService(supabase).getById(existingId);
    const patch: Record<string, unknown> = {};
    if (!current.whatsapp && phone) patch.whatsapp = phone;
    if (!current.email && email) patch.email = email;
    if (current.kind === "individual" && !current.fullName) patch.full_name = row.name;
    if (current.kind === "company") {
      if (!current.companyName && row.company) patch.company_name = row.company;
      if (!current.responsibleName) patch.responsible_name = row.name;
    }
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("clients").update(patch).eq("id", existingId);
      if (error) throw new Error(error.message);
    }
    const { error: roleError } = await supabase
      .from("client_roles")
      .upsert({ client_id: existingId, role: "cliente" }, { onConflict: "client_id,role", ignoreDuplicates: true });
    if (roleError) throw new Error(roleError.message);
    return existingId;
  }

  const kind = row.company?.trim() ? "company" : "individual";
  const created = await getClientService(supabase).register({
    kind,
    status: "active",
    fullName: kind === "individual" ? row.name : undefined,
    companyName: kind === "company" ? row.company ?? row.name : undefined,
    responsibleName: kind === "company" ? row.name : undefined,
    whatsapp: row.phone,
    email: row.email ?? undefined,
    notes: `Cadastro criado a partir da solicitação comercial do site ${row.id.slice(0, 8).toUpperCase()}.`,
    roles: ["cliente"],
  });
  return created.id;
}

async function resolveOrCreateClient(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  row: SubscriptionInterestRow,
): Promise<string> {
  if (!row.customer_kind || !row.document_number) {
    throw new Error("A solicitação não possui CPF/CNPJ. Peça o documento antes de converter.");
  }

  const candidateIds = new Set<string>();
  const phone = onlyDigits(row.phone);
  const email = row.email?.trim().toLowerCase() || "";
  const document = onlyDigits(row.document_number);
  const documentValid =
    row.customer_kind === "company" ? isValidCnpj(document) : isValidCpf(document);
  if (!documentValid) {
    throw new Error(row.customer_kind === "company" ? "CNPJ inválido." : "CPF inválido.");
  }
  if (row.customer_kind === "company" && !row.company?.trim()) {
    throw new Error("Informe a empresa/razão social antes de converter a assinatura.");
  }

  const addMatches = (matches: Array<{ id: string; status: string }> | null): void => {
    for (const match of matches ?? []) {
      if (match.status === "inactive") {
        throw new Error("Já existe um cadastro inativo com os dados desta solicitação. Reative o cadastro antes de converter.");
      }
      candidateIds.add(match.id);
    }
  };

  if (document) {
    const documentColumn = row.customer_kind === "company" ? "cnpj" : "cpf";
    const { data, error } = await supabase
      .from("clients")
      .select("id, status")
      .eq(documentColumn, document)
      .limit(3);
    if (error) throw new Error(error.message);
    addMatches(data as Array<{ id: string; status: string }> | null);
  }

  if (phone) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, status")
      .or(`whatsapp.eq.${phone},phone_primary.eq.${phone}`)
      .limit(3);
    if (error) throw new Error(error.message);
    addMatches(data as Array<{ id: string; status: string }> | null);
  }

  if (email) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, status")
      .ilike("email", email)
      .limit(3);
    if (error) throw new Error(error.message);
    addMatches(data as Array<{ id: string; status: string }> | null);
  }

  if (candidateIds.size > 1) {
    throw new Error("Os dados da solicitação apontam para cadastros diferentes. Confira CPF/CNPJ, telefone e e-mail antes de converter.");
  }

  const clientService = getClientService(supabase);
  const existingId = [...candidateIds][0];

  if (existingId) {
    const current = await clientService.getById(existingId);
    if (current.kind !== row.customer_kind) {
      throw new Error("O cadastro localizado tem tipo diferente (pessoa física/empresa). Confira antes de converter.");
    }

    const currentDocument = onlyDigits(current.kind === "company" ? current.cnpj : current.cpf);
    if (currentDocument && currentDocument !== document) {
      throw new Error("O CPF/CNPJ informado é diferente do documento já cadastrado. Confira antes de converter.");
    }

    // Atualização PARCIAL deliberada: não passa pelo save_client completo,
    // porque a conversão de uma solicitação não deve limpar/reescrever
    // dados fiscais já existentes (inscrição municipal, e-mail fiscal,
    // código IBGE etc.). Só completa campos necessários que estiverem vazios.
    const patch: Record<string, unknown> = {};
    if (!currentDocument) patch[current.kind === "company" ? "cnpj" : "cpf"] = document;
    if (!current.whatsapp) patch.whatsapp = onlyDigits(row.phone);
    if (!current.email && row.email) patch.email = row.email.trim().toLowerCase();
    if (current.kind === "individual" && !current.fullName) patch.full_name = row.name;
    if (current.kind === "company") {
      if (!current.companyName && row.company) patch.company_name = row.company;
      if (!current.responsibleName) patch.responsible_name = row.name;
    }
    if (!current.address.zip && row.address_zip) patch.address_zip = row.address_zip;
    if (!current.address.street && row.address_street) patch.address_street = row.address_street;
    if (!current.address.number && row.address_number) patch.address_number = row.address_number;
    if (!current.address.complement && row.address_complement) patch.address_complement = row.address_complement;
    if (!current.address.neighborhood && row.address_neighborhood) patch.address_neighborhood = row.address_neighborhood;
    if (!current.address.city && row.address_city) patch.address_city = row.address_city;
    if (!current.address.state && row.address_state) patch.address_state = row.address_state;

    if (Object.keys(patch).length > 0) {
      const { error: patchError } = await supabase.from("clients").update(patch).eq("id", existingId);
      if (patchError) throw new Error(patchError.message);
    }

    const { error: roleError } = await supabase
      .from("client_roles")
      .upsert(
        { client_id: existingId, role: "cliente" },
        { onConflict: "client_id,role", ignoreDuplicates: true },
      );
    if (roleError) throw new Error(roleError.message);

    return existingId;
  }

  const created = await clientService.register({
    kind: row.customer_kind,
    status: "active",
    fullName: row.customer_kind === "individual" ? row.name : undefined,
    cpf: row.customer_kind === "individual" ? document : undefined,
    companyName: row.customer_kind === "company" ? row.company ?? row.name : undefined,
    cnpj: row.customer_kind === "company" ? document : undefined,
    responsibleName: row.customer_kind === "company" ? row.name : undefined,
    whatsapp: row.phone,
    email: row.email ?? undefined,
    address: {
      zip: row.address_zip ?? undefined,
      street: row.address_street ?? undefined,
      number: row.address_number ?? undefined,
      complement: row.address_complement ?? undefined,
      neighborhood: row.address_neighborhood ?? undefined,
      city: row.address_city ?? undefined,
      state: row.address_state ?? undefined,
    },
    notes: `Cadastro criado a partir da solicitação do site ${row.id.slice(0, 8).toUpperCase()}.`,
    roles: ["cliente"],
  });
  return created.id;
}

export async function updateSiteInterestStatusAction(
  id: string,
  status: SiteInterestStatus,
): Promise<void> {
  if (!VALID_STATUSES.includes(status)) return;
  // "converted" nunca passa por aqui — só pelas ações dedicadas
  // (convertSubscriptionInterestAction/convertAdvertisingInterestAction),
  // que criam de fato o cliente + assinatura/proposta antes de marcar o
  // status. Sem essa trava, dava pra marcar "convertida" sem nenhum
  // vínculo comercial real (bug corrigido em 31/10/2026).
  if (status === "converted") {
    throw new Error("Use a ação de conversão específica (assinatura ou publicidade) — ela cria o cliente e o vínculo comercial antes de marcar como convertida.");
  }

  const permissionError = await checkModuleAction("publicidade", "solicitacoes_gerenciar");
  if (permissionError) throw new Error(permissionError);

  const client = createSupabaseServerClient();
  const audit = await getAuditContext(client);

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status,
    reviewed_by: audit.actorId,
    reviewed_at: now,
  };
  if (status === "discarded") {
    update.attended_at = now;
    update.attended_by = audit.actorId;
  }

  const { error } = await client
    .from("site_interest_requests")
    .update(update)
    .eq("id", id);

  if (error) throw new Error(error.message);

  await recordAuditEventSupabase(client, {
    userId: audit.actorId,
    entityType: "site_interest_request",
    entityId: id,
    action: "status_change",
    metadata: { status },
  });

  paths();
}

export async function markSiteInterestAttendedAction(id: string): Promise<void> {
  const permissionError = await checkModuleAction("publicidade", "solicitacoes_gerenciar");
  if (permissionError) throw new Error(permissionError);

  const client = createSupabaseServerClient();
  const audit = await getAuditContext(client);
  const { data: current, error: currentError } = await client
    .from("site_interest_requests")
    .select("status")
    .eq("id", id)
    .single();
  if (currentError) throw new Error(currentError.message);

  const now = new Date().toISOString();
  const { error } = await client
    .from("site_interest_requests")
    .update({
      attended_at: now,
      attended_by: audit.actorId,
      status: current.status === "new" ? "contacted" : current.status,
      reviewed_by: audit.actorId,
      reviewed_at: now,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAuditEventSupabase(client, {
    userId: audit.actorId,
    entityType: "site_interest_request",
    entityId: id,
    action: "attended",
    metadata: {},
  });

  paths();
}

export async function reviewSiteInterestAction(id: string, formData: FormData): Promise<void> {
  const availability = String(formData.get("availability") ?? "pending") as SiteInterestAvailability;
  if (!VALID_AVAILABILITY.includes(availability)) return;

  const totalRaw = String(formData.get("approvedTotal") ?? "").trim().replace(",", ".");
  const approvedTotal = totalRaw ? Number(totalRaw) : null;
  if (approvedTotal !== null && (!Number.isFinite(approvedTotal) || approvedTotal < 0)) {
    throw new Error("Valor aprovado inválido.");
  }

  const adminNote = String(formData.get("adminNote") ?? "").trim();
  if (adminNote.length > 3000) throw new Error("Observação muito longa.");

  const permissionError = await checkModuleAction("publicidade", "solicitacoes_gerenciar");
  if (permissionError) throw new Error(permissionError);

  const client = createSupabaseServerClient();
  const audit = await getAuditContext(client);
  const { data: current, error: currentError } = await client
    .from("site_interest_requests")
    .select("status")
    .eq("id", id)
    .single();
  if (currentError) throw new Error(currentError.message);

  const update: Record<string, unknown> = {
    availability_status: availability,
    approved_total: approvedTotal,
    admin_note: adminNote || null,
    reviewed_by: audit.actorId,
    reviewed_at: new Date().toISOString(),
  };

  if (availability !== "pending" && current.status !== "converted" && current.status !== "discarded") {
    update.status = "contacted";
  }

  const { error } = await client.from("site_interest_requests").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAuditEventSupabase(client, {
    userId: audit.actorId,
    entityType: "site_interest_request",
    entityId: id,
    action: "review",
    metadata: { availability, approvedTotal, adminNote: adminNote || null },
  });

  paths();
}

// Trava otimista contra duas conversões simultâneas da MESMA
// solicitação (duplo clique, ou dois operadores ao mesmo tempo) —
// Bloco 2, item 5 (01/11/2026). Sem isso, a checagem de idempotência
// por `originTag` nas notas (ver ensureSubscriptionAndReceivable e a
// busca de proposta em convertAdvertisingInterestAction) tem uma
// corrida real: as duas chamadas concorrentes podem passar pela busca
// "ainda não existe" antes de qualquer uma delas criar algo, cada uma
// criando sua própria assinatura/proposta — só a última grava o
// vínculo final, a primeira fica órfã sem nenhum erro visível.
const CONVERSION_CLAIM_STALE_AFTER_MS = 2 * 60 * 1000;

/**
 * Marca atomicamente que esta conversão começou (UPDATE condicional —
 * só afeta a linha se ainda não estiver convertida/descartada e não
 * houver outra conversão em andamento, ou se a conversão anterior
 * estiver "travada" há mais de 2 minutos, tratada como abandonada por
 * falha parcial/crash do processo). Lança erro amigável se outra
 * chamada já tiver a trava.
 */
async function claimConversion(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  id: string,
): Promise<void> {
  const staleBefore = new Date(Date.now() - CONVERSION_CLAIM_STALE_AFTER_MS).toISOString();
  const { data, error } = await supabase
    .from("site_interest_requests")
    .update({ conversion_started_at: new Date().toISOString() })
    .eq("id", id)
    .not("status", "in", "(converted,discarded)")
    .or(`conversion_started_at.is.null,conversion_started_at.lt.${staleBefore}`)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Esta solicitação já está sendo convertida (ou foi convertida) em outra operação. Atualize a página antes de tentar de novo.");
  }
}

/** Libera a trava quando a conversão falha no meio do caminho — nunca bloqueia uma nova tentativa legítima por mais que o necessário (best-effort: se isso falhar, a trava só expira depois de CONVERSION_CLAIM_STALE_AFTER_MS). */
async function releaseConversionClaim(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  id: string,
): Promise<void> {
  await supabase.from("site_interest_requests").update({ conversion_started_at: null }).eq("id", id);
}

interface EnsuredSubscription {
  subscriptionId: string;
  subscriptionReference: string;
  receivableId: string;
  receivableReference: string;
}

/**
 * Cria (ou reaproveita, por idempotência via `originTag` nas notas) a
 * assinatura + primeiro título financeiro de uma solicitação — extraído
 * de `convertSubscriptionInterestAction` pra ser reaproveitado também
 * pela conversão de pacotes mistos (`convertAdvertisingInterestAction`),
 * sem duplicar a lógica.
 */
async function ensureSubscriptionAndReceivable(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  row: SubscriptionInterestRow,
  clientId: string,
  amount: number,
  originTag: string,
  protocol: string,
): Promise<EnsuredSubscription> {
  const { data: existingSubscriptionRows, error: existingSubscriptionError } = await supabase
    .from("subscriptions")
    .select("id")
    .ilike("notes", `%${originTag}%`)
    .limit(2);
  if (existingSubscriptionError) throw new Error(existingSubscriptionError.message);

  let subscription =
    existingSubscriptionRows && existingSubscriptionRows.length > 0
      ? await getSubscriptionService(supabase).getById(existingSubscriptionRows[0].id as string)
      : null;

  if (!subscription) {
    const startsAt = todayInBrazil();
    subscription = await getSubscriptionService(supabase).register({
      clientId,
      serviceType: "impresso",
      status: "active",
      amount,
      periodicity: "annual",
      startsAt,
      nextDueDate: addYearsIso(startsAt, 1),
      print: {
        copies: 1,
        addressZip: row.address_zip ?? undefined,
        addressStreet: row.address_street ?? undefined,
        addressNumber: row.address_number ?? undefined,
        addressComplement: row.address_complement ?? undefined,
        addressNeighborhood: row.address_neighborhood ?? undefined,
        addressCity: row.address_city ?? undefined,
        addressState: row.address_state ?? undefined,
      },
      notes: [
        originTag,
        `Solicitação do site ${protocol}.`,
        row.payment_preference ? `Preferência de pagamento informada: ${row.payment_preference}.` : null,
        row.notes ? `Observação do assinante: ${row.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  const receivableService = getReceivableService(supabase);
  const existingReceivables = await receivableService.list({ subscriptionId: subscription.id });
  let receivable = existingReceivables.find(
    (item) => item.competencyDate === subscription!.startsAt || item.notes?.includes(originTag),
  );

  if (!receivable) {
    const { data: settings } = await supabase
      .from("billing_provider_settings")
      .select("default_due_days")
      .eq("id", 1)
      .maybeSingle();
    const dueDaysRaw = Number(settings?.default_due_days ?? 3);
    const dueDays = Number.isFinite(dueDaysRaw) ? Math.max(0, Math.min(60, Math.floor(dueDaysRaw))) : 3;

    const createdReceivable = await receivableService.registerFromSubscription({
      clientId,
      description: "Assinatura anual do Informativo Regional",
      sourceType: "subscription",
      sourceId: subscription.id,
      sourceReference: `Assinatura ${subscription.reference}`,
      subscriptionId: subscription.id,
      originalAmount: amount,
      issueDate: subscription.startsAt,
      dueDate: addDaysIso(subscription.startsAt, dueDays),
      competencyDate: subscription.startsAt,
      notes: `${originTag} Gerada a partir da solicitação do site ${protocol}.`,
    });
    receivable = await receivableService.getById(createdReceivable.id);
  }

  return {
    subscriptionId: subscription.id,
    subscriptionReference: subscription.reference,
    receivableId: receivable.id,
    receivableReference: receivable.reference,
  };
}

/**
 * Bloco C (02/11/2026) — `confirmed` precisa ser `true`: representa que
 * o operador já revisou cliente, serviço, valor e condições num resumo
 * explícito na UI (ver ConvertSubscriptionInterestButton) antes deste
 * clique. Defesa em profundidade — a Server Action nunca confia só na UI
 * ter mostrado o resumo, confere de novo aqui.
 */
export async function convertSubscriptionInterestAction(id: string, confirmed: boolean): Promise<ConvertSubscriptionInterestResult> {
  const permissionError = await checkModuleAction("assinaturas", "assinaturas_criar");
  if (permissionError) return { error: permissionError };
  if (confirmed !== true) {
    return { error: "Confirme o resumo (cliente, serviço, valor e condições) antes de criar a assinatura." };
  }

  const supabase = createSupabaseServerClient();
  let claimed = false;

  try {
    const { data, error } = await supabase
      .from("site_interest_requests")
      .select(
        "id, request_type, name, phone, email, company, customer_kind, document_number, selections, estimated_total, notes, status, payment_preference, " +
          "address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, " +
          "availability_status, approved_total, admin_note",
      )
      .eq("id", id)
      .single();

    if (error || !data) throw new Error(error?.message ?? "Solicitação não encontrada.");
    const row = data as unknown as SubscriptionInterestRow;

    if (row.request_type !== "subscription") {
      return {
        error:
          "A conversão automática está liberada apenas para solicitações somente de assinatura. Solicitações mistas precisam ser fechadas junto com a parte de publicidade.",
      };
    }
    if (row.status === "converted") return { error: "Esta solicitação já foi convertida." };
    if (row.status === "discarded") return { error: "Esta solicitação está descartada." };
    if (row.availability_status !== "approved") {
      return { error: "Aprove primeiro a rota/disponibilidade da assinatura." };
    }

    const selectionAmount = subscriptionSelectionAmount(row.selections);
    const amountValue = row.approved_total ?? selectionAmount ?? row.estimated_total;
    const amount = amountValue === null ? Number.NaN : Number(amountValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: "Defina um valor aprovado maior que zero antes de converter." };
    }

    await claimConversion(supabase, id);
    claimed = true;

    const protocol = row.id.slice(0, 8).toUpperCase();
    const originTag = `[site-interest:${row.id}]`;
    const audit = await getAuditContext(supabase);
    const clientId = await resolveOrCreateClient(supabase, row);

    const { subscriptionId, subscriptionReference, receivableId, receivableReference } =
      await ensureSubscriptionAndReceivable(supabase, row, clientId, amount, originTag, protocol);

    const conversionLine = `Assinatura convertida: ${subscriptionReference}; financeiro: ${receivableReference}.`;
    const adminNote = [row.admin_note?.trim(), conversionLine].filter(Boolean).join("\n").slice(0, 3000);

    const { error: updateError } = await supabase
      .from("site_interest_requests")
      .update({
        status: "converted",
        admin_note: adminNote,
        // Depois da conversão, o documento passa a existir somente no
        // cadastro mestre do cliente. Não mantém CPF/CNPJ duplicado na
        // fila comercial além do tempo necessário para a contratação.
        document_number: null,
        converted_client_id: clientId,
        converted_subscription_id: subscriptionId,
        converted_receivable_id: receivableId,
        converted_at: new Date().toISOString(),
        attended_at: new Date().toISOString(),
        attended_by: audit.actorId,
        reviewed_by: audit.actorId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);

    await recordAuditEventSupabase(supabase, {
      userId: audit.actorId,
      entityType: "site_interest_request",
      entityId: id,
      action: "convert_subscription",
      metadata: {
        clientId,
        subscriptionId,
        subscriptionReference,
        receivableId,
        receivableReference,
        amount,
      },
    });

    paths();
    revalidatePath("/sistema/clientes");
    revalidatePath(`/sistema/clientes/${clientId}`);
    revalidatePath("/sistema/assinaturas");
    revalidatePath(`/sistema/assinaturas/${subscriptionId}`);
    revalidatePath("/sistema/financeiro");
    revalidatePath("/sistema/financeiro/contas-a-receber");
    revalidatePath(`/sistema/financeiro/contas-a-receber/${receivableId}`);

    return { ok: true, clientId, subscriptionId, receivableId };
  } catch (error) {
    // Falha parcial: se a trava já tinha sido tomada, libera pra não
    // bloquear uma nova tentativa legítima além do necessário (ver
    // claimConversion/CONVERSION_CLAIM_STALE_AFTER_MS acima).
    if (claimed) await releaseConversionClaim(supabase, id);
    return { error: error instanceof Error ? error.message : "Não foi possível converter a solicitação em assinatura." };
  }
}

export type ConvertAdvertisingInterestResult =
  | { error: string }
  | { ok: true; clientId: string; proposalId: string; proposalReference: string; subscriptionId?: string };

/**
 * Conversão real de solicitações de publicidade e pacotes mistos —
 * corrige o bug em que "Marcar convertida" só mudava o status, sem
 * criar cliente, proposta ou (no caso misto) assinatura/financeiro
 * (31/10/2026). Publicidade pura: cria cliente (sem exigir CPF/CNPJ
 * ainda, igual à solicitação só de publicidade) + proposta comercial
 * com os itens de publicidade, como pré-venda (nunca uma venda/
 * contrato fechado automaticamente — isso continua exigindo a
 * aprovação manual da proposta, mesmo fluxo já existente de Comercial).
 * Pacote misto: usa o cliente com CPF/CNPJ (mesma regra da assinatura)
 * e cria TAMBÉM a assinatura + primeiro título financeiro, reaproveitando
 * `ensureSubscriptionAndReceivable`.
 */
/** Bloco C (02/11/2026) — mesma exigência de confirmação explícita de
 * cliente/serviço/valor/condições de convertSubscriptionInterestAction. */
export async function convertAdvertisingInterestAction(id: string, confirmed: boolean): Promise<ConvertAdvertisingInterestResult> {
  const permissionError = await checkModuleAction("publicidade", "solicitacoes_gerenciar");
  if (permissionError) return { error: permissionError };
  if (confirmed !== true) {
    return { error: "Confirme o resumo (cliente, serviço, valor e condições) antes de converter." };
  }

  const supabase = createSupabaseServerClient();
  let claimed = false;

  try {
    const { data, error } = await supabase
      .from("site_interest_requests")
      .select(
        "id, request_type, name, phone, email, company, customer_kind, document_number, selections, estimated_total, notes, status, payment_preference, " +
          "address_zip, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, " +
          "availability_status, approved_total, admin_note",
      )
      .eq("id", id)
      .single();

    if (error || !data) throw new Error(error?.message ?? "Solicitação não encontrada.");
    const row = data as unknown as SubscriptionInterestRow;

    if (row.request_type === "subscription") {
      return { error: "Esta solicitação é somente de assinatura — use a conversão de assinatura." };
    }
    if (row.status === "converted") return { error: "Esta solicitação já foi convertida." };
    if (row.status === "discarded") return { error: "Esta solicitação está descartada." };
    if (row.availability_status !== "approved") {
      return { error: "Aprove primeiro a disponibilidade antes de converter." };
    }

    const items = advertisingSelections(row.selections);
    const subscriptionAmount = row.request_type === "mixed" ? subscriptionSelectionAmount(row.selections) : null;
    if (items.length === 0 && (subscriptionAmount === null || subscriptionAmount <= 0)) {
      return {
        error: "Não foi possível identificar os itens de publicidade (ou assinatura) desta solicitação. Ajuste manualmente antes de converter.",
      };
    }

    // Bloco 2, item 3 (01/11/2026): a proposta/assinatura SEMPRE usa o
    // preço de cada item individual de `selections`, nunca o
    // `approved_total` (que é um único valor pro pedido inteiro,
    // publicidade+assinatura somadas — não dá pra ratear automaticamente
    // sem inventar uma regra comercial). Se o operador editou o valor
    // aprovado durante a revisão (ex.: aplicou desconto de combo) e ele
    // ficou divergente da soma dos itens, bloqueia a conversão em vez de
    // criar o registro com valores desatualizados/divergentes — evita o
    // caso real "aprovei X com desconto, mas o sistema cobrou a soma dos
    // itens sem desconto".
    const itemsTotal = advertisingItemsTotal(items, subscriptionAmount);
    if (row.approved_total !== null && approvedTotalDivergesFromItems(row.approved_total, itemsTotal)) {
      return {
        error:
          `O valor aprovado (R$ ${row.approved_total.toFixed(2)}) é diferente da soma dos itens da solicitação ` +
          `(R$ ${itemsTotal.toFixed(2)}). A conversão usa o preço de cada item individualmente — ajuste os itens ` +
          "ou o valor aprovado antes de converter, pra não gerar proposta/assinatura com valor divergente do aprovado.",
      };
    }

    await claimConversion(supabase, id);
    claimed = true;

    const protocol = row.id.slice(0, 8).toUpperCase();
    const originTag = `[site-interest:${row.id}]`;
    const audit = await getAuditContext(supabase);

    // Pacote misto exige CPF/CNPJ (mesma regra da assinatura, já que
    // cria uma assinatura de verdade); publicidade pura aceita cadastro
    // sem documento fiscal ainda, igual ao comportamento já existente.
    const clientId =
      row.request_type === "mixed"
        ? await resolveOrCreateClient(supabase, row)
        : await resolveOrCreateAdvertisingClient(supabase, row);

    let subscriptionId: string | undefined;
    let receivableId: string | undefined;
    if (subscriptionAmount !== null && subscriptionAmount > 0) {
      const ensured = await ensureSubscriptionAndReceivable(supabase, row, clientId, subscriptionAmount, originTag, protocol);
      subscriptionId = ensured.subscriptionId;
      receivableId = ensured.receivableId;
    }

    let proposalId: string;
    let proposalReference: string;

    if (items.length > 0) {
      const { data: existingProposalRows, error: existingProposalError } = await supabase
        .from("commercial_proposals")
        .select("id")
        .ilike("internal_notes", `%${originTag}%`)
        .limit(2);
      if (existingProposalError) throw new Error(existingProposalError.message);

      const proposalService = getCommercialProposalService(supabase);
      const existingProposal =
        existingProposalRows && existingProposalRows.length > 0
          ? await proposalService.getById(existingProposalRows[0].id as string)
          : null;

      const proposal =
        existingProposal ??
        (await proposalService.register({
          clientId,
          proposalDate: todayInBrazil(),
          commercialCondition: commercialConditionFromPayment(row.payment_preference),
          notes: `Gerada a partir da solicitação do site ${protocol}.`,
          internalNotes: originTag,
          items: items.map((item) => ({
            description: item.label,
            quantity: 1,
            unitPrice: item.price,
            discountAmount: 0,
          })),
        }));

      proposalId = proposal.id;
      proposalReference = proposal.reference;
    } else {
      // Misto sem item de publicidade individualizado no payload (só
      // valor total aprovado) — nunca inventa item de proposta. A
      // assinatura já foi criada acima; grava o vínculo mesmo sem
      // marcar "converted" (a parte de publicidade segue pendente),
      // pra não deixar o link perdido nem arriscar duplicar a
      // assinatura numa nova tentativa.
      if (subscriptionId) {
        const { error: partialUpdateError } = await supabase
          .from("site_interest_requests")
          .update({
            converted_subscription_id: subscriptionId,
            converted_receivable_id: receivableId ?? null,
            // Libera a trava — essa é uma nova tentativa legítima
            // (criar a proposta manualmente depois), não uma corrida.
            conversion_started_at: null,
          })
          .eq("id", id);
        if (partialUpdateError) throw new Error(partialUpdateError.message);
      } else {
        await releaseConversionClaim(supabase, id);
      }
      return { error: "Assinatura convertida, mas não foi possível identificar os itens de publicidade. Crie a proposta manualmente para concluir a parte comercial." };
    }

    const conversionLine = [
      `Proposta comercial criada: ${proposalReference}.`,
      subscriptionId ? `Assinatura convertida: ${subscriptionId}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const adminNote = [row.admin_note?.trim(), conversionLine].filter(Boolean).join("\n").slice(0, 3000);

    const { error: updateError } = await supabase
      .from("site_interest_requests")
      .update({
        status: "converted",
        admin_note: adminNote,
        document_number: null,
        converted_client_id: clientId,
        converted_proposal_id: proposalId,
        converted_subscription_id: subscriptionId ?? null,
        converted_receivable_id: receivableId ?? null,
        converted_at: new Date().toISOString(),
        attended_at: new Date().toISOString(),
        attended_by: audit.actorId,
        reviewed_by: audit.actorId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);

    await recordAuditEventSupabase(supabase, {
      userId: audit.actorId,
      entityType: "site_interest_request",
      entityId: id,
      action: "convert_advertising",
      metadata: { clientId, proposalId, proposalReference, subscriptionId },
    });

    paths();
    revalidatePath("/sistema/clientes");
    revalidatePath(`/sistema/clientes/${clientId}`);
    revalidatePath("/sistema/publicidade/propostas");
    revalidatePath(`/sistema/publicidade/propostas/${proposalId}`);
    if (subscriptionId) revalidatePath("/sistema/assinaturas");

    return { ok: true, clientId, proposalId, proposalReference, subscriptionId };
  } catch (error) {
    if (claimed) await releaseConversionClaim(supabase, id);
    return { error: error instanceof Error ? error.message : "Não foi possível converter a solicitação de publicidade." };
  }
}
