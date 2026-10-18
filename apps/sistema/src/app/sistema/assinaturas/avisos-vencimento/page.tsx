import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { DueReminderPanel } from "../../../../features/assinaturas/DueReminderPanel";
import { isWhatsappDueReminderReady, listDueReminderBatchesAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AvisosVencimentoPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !["owner", "admin"].includes(profile.role)) redirect("/sistema");

  const [history, readiness] = await Promise.all([
    listDueReminderBatchesAction(),
    isWhatsappDueReminderReady(),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow="ASSINATURAS"
        title="Avisos de vencimento"
        description="Relação mensal de assinaturas a vencer, para aviso manual via WhatsApp — processo sempre revisado e confirmado por um responsável, nunca automático."
      />
      <DueReminderPanel
        initialHistory={"ok" in history ? history.data : []}
        initialError={"error" in history ? history.error : null}
        templateConfigured={readiness.templateConfigured}
        sendEnabled={readiness.sendEnabled}
      />
    </>
  );
}
