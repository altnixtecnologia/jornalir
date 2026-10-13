import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { BillingProviderSettingsPanel } from "../../../../features/configuracoes/BillingProviderSettingsPanel";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { isAsaasApiKeyConfigured } from "../../../../lib/financeiro/asaasEnv";
import { getAsaasWebhookEndpoint, getAsaasWebhookToken } from "../../../../lib/financeiro/asaasWebhookConfig";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BillingProviderSettingsPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data, error } = await client
    .from("billing_provider_settings")
    .select("environment, enabled, allow_pix, allow_boleto, allow_credit_card, allow_cash, default_due_days, finance_whatsapp")
    .eq("id", 1)
    .single();

  if (error) throw new Error(error.message);

  return (
    <>
      <ModuleHeader
        eyebrow="CONFIGURAÇÕES / COBRANÇAS"
        title="Cobranças e Asaas"
        description="Configuração central de cobranças. A emissão só acontece depois da confirmação operacional."
      />
      <BillingProviderSettingsPanel
        values={{
          environment: data.environment as "sandbox" | "production",
          enabled: Boolean(data.enabled),
          allowPix: Boolean(data.allow_pix),
          allowBoleto: Boolean(data.allow_boleto),
          allowCreditCard: Boolean(data.allow_credit_card),
          allowCash: Boolean(data.allow_cash),
          defaultDueDays: Number(data.default_due_days),
          financeWhatsapp: data.finance_whatsapp ?? "",
          sandboxKeyConfigured: isAsaasApiKeyConfigured("sandbox"),
          productionKeyConfigured: isAsaasApiKeyConfigured("production"),
          webhookTokenConfigured: Boolean(getAsaasWebhookToken()),
          webhookEndpoint: getAsaasWebhookEndpoint(),
        }}
      />
    </>
  );
}
