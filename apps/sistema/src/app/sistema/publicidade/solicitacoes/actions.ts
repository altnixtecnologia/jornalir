"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

export type SiteInterestStatus = "new" | "contacted" | "converted" | "discarded";
export type SiteInterestAvailability = "pending" | "approved" | "unavailable" | "needs_info";

const VALID_STATUSES: readonly SiteInterestStatus[] = ["new", "contacted", "converted", "discarded"];
const VALID_AVAILABILITY: readonly SiteInterestAvailability[] = ["pending", "approved", "unavailable", "needs_info"];

function paths(): void {
  revalidatePath("/sistema/publicidade");
  revalidatePath("/sistema/publicidade/solicitacoes");
  revalidatePath("/sistema");
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
  const update: Record<string, unknown> = {
    availability_status: availability,
    approved_total: approvedTotal,
    admin_note: adminNote || null,
    reviewed_by: audit.actorId,
    reviewed_at: new Date().toISOString(),
  };

  if (availability !== "pending") update.status = "contacted";

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
