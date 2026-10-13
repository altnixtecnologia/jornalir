"use server";

import { revalidatePath } from "next/cache";
import { isValidCnpj, isValidCpf } from "@ir/core";
import { getClientService } from "../../../../composition/clientes";
import { getSubscriptionService } from "../../../../composition/assinaturas";
import { getReceivableService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

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
}

export type ConvertSubscriptionInterestResult =
  | { error: string }
  | { ok: true; clientId: string; subscriptionId: string; receivableId: string };

function paths(): void {
  revalidatePath("/sistema/publicidade");
  revalidatePath("/sistema/publicidade/solicitacoes");
  revalidatePath("/sistema");
}

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function todayInBrazil(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addYearsIso(iso: string, years: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function subscriptionSelectionAmount(selections: unknown): number | null {
  if (!Array.isArray(selections)) return null;
  for (const selection of selections) {
    if (!selection || typeof selection !== "object") continue;
    const item = selection as Record<string, unknown>;
    const isSubscription = item.type === "subscription" || item.kind === "subscription" || item.id === "annual-newspaper";
    if (!isSubscription) continue;
    for (const key of ["finalPrice", "individualPrice", "price"]) {
      const value = item[key];
      if (value === null || value === undefined || value === "") continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return null;
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

  const client = createSupabaseServerClient();
  const audit = await getAuditContext(client);

  const { error } = await client
    .from("site_interest_requests")
    .update({
      status,
      reviewed_by: audit.actorId,
      reviewed_at: new Date().toISOString(),
    })
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

export async function convertSubscriptionInterestAction(id: string): Promise<ConvertSubscriptionInterestResult> {
  const supabase = createSupabaseServerClient();

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
    const row = data as SubscriptionInterestRow;

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

    const protocol = row.id.slice(0, 8).toUpperCase();
    const originTag = `[site-interest:${row.id}]`;
    const audit = await getAuditContext(supabase);
    const clientId = await resolveOrCreateClient(supabase, row);

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

      receivable = await receivableService.registerFromSubscription({
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
    }

    const conversionLine = `Assinatura convertida: ${subscription.reference}; financeiro: ${receivable.reference}.`;
    const adminNote = [row.admin_note?.trim(), conversionLine].filter(Boolean).join("\n").slice(0, 3000);

    const { error: updateError } = await supabase
      .from("site_interest_requests")
      .update({
        status: "converted",
        admin_note: adminNote,
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
        subscriptionId: subscription.id,
        subscriptionReference: subscription.reference,
        receivableId: receivable.id,
        receivableReference: receivable.reference,
        amount,
      },
    });

    paths();
    revalidatePath("/sistema/clientes");
    revalidatePath(`/sistema/clientes/${clientId}`);
    revalidatePath("/sistema/assinaturas");
    revalidatePath(`/sistema/assinaturas/${subscription.id}`);
    revalidatePath("/sistema/financeiro");
    revalidatePath("/sistema/financeiro/contas-a-receber");
    revalidatePath(`/sistema/financeiro/contas-a-receber/${receivable.id}`);

    return { ok: true, clientId, subscriptionId: subscription.id, receivableId: receivable.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível converter a solicitação em assinatura." };
  }
}
