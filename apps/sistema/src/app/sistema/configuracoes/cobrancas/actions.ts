"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";
import { isAsaasApiKeyConfigured } from "../../../../lib/financeiro/asaasEnv";

export interface BillingProviderSettingsInput {
  environment: "sandbox" | "production";
  enabled: boolean;
  allowPix: boolean;
  allowBoleto: boolean;
  allowCreditCard: boolean;
  allowCash: boolean;
  defaultDueDays: string;
  financeWhatsapp: string;
}

export async function updateBillingProviderSettingsAction(
  input: BillingProviderSettingsInput,
): Promise<{ ok: true } | { error: string }> {
  try {
    const dueDays = Number(input.defaultDueDays);
    if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 60) {
      return { error: "Informe um prazo padrão entre 0 e 60 dias." };
    }

    const keyConfigured = isAsaasApiKeyConfigured(input.environment);

    if (input.enabled && !keyConfigured) {
      return {
        error:
          input.environment === "sandbox"
            ? "Configure ASAAS_API_KEY_SANDBOX no ambiente seguro antes de habilitar."
            : "Configure ASAAS_API_KEY_PRODUCTION no ambiente seguro antes de habilitar.",
      };
    }

    const client = createSupabaseServerClient();
    const audit = await getAuditContext(client);
    const values = {
      environment: input.environment,
      enabled: input.enabled,
      allow_pix: input.allowPix,
      // Boleto/cartão ainda não têm provider implementado; nunca gravar como habilitados só porque a UI já os prepara.
      allow_boleto: false,
      allow_credit_card: false,
      allow_cash: input.allowCash,
      default_due_days: dueDays,
      finance_whatsapp: input.financeWhatsapp.trim() || null,
      auto_send_after_approval: false,
    };

    const { error } = await client.from("billing_provider_settings").update(values).eq("id", 1);
    if (error) throw new Error(error.message);

    await recordAuditEventSupabase(client, {
      userId: audit.actorId,
      entityType: "billing_provider_settings",
      entityId: "1",
      action: "update",
      metadata: { ...values, apiKeyStoredInDatabase: false },
    });

    revalidatePath("/sistema/configuracoes/cobrancas");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar as configurações." };
  }
}
