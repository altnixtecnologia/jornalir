import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { checkFinanceAction } from "../../../../lib/permissions/checkFinanceAction";
import { FinancialNotificationBatchPanel } from "../../../../features/financeiro/FinancialNotificationBatchPanel";
import { isWhatsappCloudConfigured } from "../../../../lib/financeiro/whatsappCloudProvider";
import { approvedTemplateName, TEMPLATE_DEFINITIONS } from "../../../../lib/notifications/whatsappTemplates";

export const dynamic = "force-dynamic";

export default async function AvisosClientesPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  if (await checkFinanceAction("pix_enviar")) redirect("/sistema/financeiro");

  const templates = (["manual_billing", "manual_confirmation", "manual_receipt"] as const).map((event) => ({
    kind: event === "manual_billing" ? "billing" : event === "manual_confirmation" ? "confirmation" : "receipt",
    configured: Boolean(approvedTemplateName(event, process.env)),
    proposedName: TEMPLATE_DEFINITIONS[event].proposedName,
  }));

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO"
        title="Avisos aos clientes"
        description="Envio manual de WhatsApp sobre cobranças, pagamentos e recibos. Cada cliente recebe uma mensagem individual, revisada e confirmada por você; nenhuma cobrança é criada pelo envio."
      />
      <FinancialNotificationBatchPanel providerReady={isWhatsappCloudConfigured()} templates={templates} />
    </>
  );
}
