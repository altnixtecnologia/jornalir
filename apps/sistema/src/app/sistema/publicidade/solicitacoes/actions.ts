"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

export type SiteInterestStatus = "new" | "contacted" | "converted" | "discarded";

const VALID_STATUSES: readonly SiteInterestStatus[] = ["new", "contacted", "converted", "discarded"];

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

  revalidatePath("/sistema/publicidade");
  revalidatePath("/sistema/publicidade/solicitacoes");
}
