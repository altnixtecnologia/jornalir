"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";
import { isAsaasApiKeyConfigured } from "../../../../lib/financeiro/asaasEnv";
import { hasServiceRoleKey } from "../../../../lib/supabase/admin";

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

    if (input.enabled && !input.allowPix) {
      return { error: "Habilite Pix antes de ativar a integração Asaas." };
    }

    if (input.enabled && !keyConfigured) {
      return {
        error:
          input.environment === "sandbox"
            ? "Configure uma chave do Sandbox (ASAAS_API_KEY_SANDBOX ou ASAAS_API_KEY com ASAAS_ENV=sandbox) antes de habilitar."
            : "Configure uma chave de Produção (ASAAS_API_KEY_PRODUCTION ou ASAAS_API_KEY com ASAAS_ENV=production) antes de habilitar.",
      };
    }

    if (input.enabled && !process.env.ASAAS_WEBHOOK_TOKEN) {
      return { error: "Configure ASAAS_WEBHOOK_TOKEN no ambiente seguro antes de habilitar a integração." };
    }

    if (input.enabled && !hasServiceRoleKey()) {
      return { error: "SUPABASE_SERVICE_ROLE_KEY precisa estar configurada para o webhook confirmar pagamentos." };
    }

    const client = createSupabaseServerClient();

    const { data: currentSettings, error: currentSettingsError } = await client
      .from("billing_provider_settings")
      .select("environment")
      .eq("id", 1)
      .single();
    if (currentSettingsError) throw new Error(currentSettingsError.message);

    if (currentSettings.environment !== input.environment) {
      const { data: pendingCharges, error: pendingError } = await client
        .from("payment_charges")
        .select("id")
        .eq("provider", "asaas")
        .eq("status", "pending")
        .limit(1);
      if (pendingError) throw new Error(pendingError.message);
      if ((pendingCharges ?? []).length > 0) {
        return {
          error:
            "Não é possível trocar o ambiente do Asaas enquanto existir cobrança Asaas pendente. Quite ou cancele as cobranças pendentes primeiro.",
        };
      }
    }

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
