"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";
import {
  getAsaasApiKey,
  getConfiguredAsaasEnvironment,
  isAsaasApiKeyConfigured,
} from "../../../../lib/financeiro/asaasEnv";
import { inspectExistingAsaasCharges, type ChargeRead } from "../../../../lib/financeiro/asaasExistingChargesRead";
import { hasServiceRoleKey } from "../../../../lib/supabase/admin";
import { probeServiceBridge } from "../../../../lib/integrations/altnixServiceAuthorization";
import {
  ASAAS_WEBHOOK_EMAIL,
  ASAAS_WEBHOOK_EVENTS,
  ASAAS_WEBHOOK_NAME,
  getAsaasWebhookEndpoint,
  getAsaasWebhookToken,
} from "../../../../lib/financeiro/asaasWebhookConfig";

// billing_provider_settings também é singleton numérico, mas audit_events.entity_id exige UUID.
const BILLING_PROVIDER_SETTINGS_AUDIT_ID = "00000000-0000-4000-8000-000000000102";

/** Verificar antes de ler credenciais, consultar Asaas ou atualizar seu webhook.
 * A proteção de página e a RLS são adicionais, não substituem este guard. */
async function requireBillingSettingsAdmin(): Promise<string | null> {
  const client = createSupabaseServerClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return "Sessão inválida. Faça login novamente.";
  const { data: allowed, error: grantError } = await client.rpc("is_active_admin_or_owner");
  if (grantError || allowed !== true) return "Somente proprietário ou administrador autorizado pode gerenciar o Asaas.";
  return null;
}

export interface BillingProviderSettingsInput {
  environment: "sandbox" | "production";
  enabled: boolean;
  allowPix: boolean;
  allowBoleto: boolean;
  allowCreditCard: boolean;
  /** Parcelas máximas do cartão (1 = só à vista). Sem juros nem taxas: o total cobrado é o saldo do título. */
  creditCardMaxInstallments: string;
  /** Valor mínimo por parcela (R$); nunca abaixo do mínimo do provedor (R$ 5,00). */
  creditCardMinInstallmentAmount: string;
  allowCash: boolean;
  defaultDueDays: string;
  financeWhatsapp: string;
}

export async function updateBillingProviderSettingsAction(
  input: BillingProviderSettingsInput,
): Promise<{ ok: true } | { error: string }> {
  try {
    const denied = await requireBillingSettingsAdmin();
    if (denied) return { error: denied };
    const dueDays = Number(input.defaultDueDays);
    if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 60) {
      return { error: "Informe um prazo padrão entre 0 e 60 dias." };
    }

    const maxInstallments = Number(input.creditCardMaxInstallments);
    const minInstallmentAmount = Number(String(input.creditCardMinInstallmentAmount).replace(",", "."));
    if (!Number.isInteger(maxInstallments) || maxInstallments < 1 || maxInstallments > 12) {
      return { error: "Informe de 1 a 12 parcelas para o cartão." };
    }
    if (!Number.isFinite(minInstallmentAmount) || minInstallmentAmount < 5) {
      return { error: "O valor mínimo por parcela não pode ser menor que R$ 5,00." };
    }
    if (input.allowCreditCard && !input.enabled) {
      return { error: "Habilite a integração Asaas antes de ativar o cartão de crédito." };
    }
    const environment = getConfiguredAsaasEnvironment() ?? input.environment;
    const keyConfigured = isAsaasApiKeyConfigured(environment);

    if (input.enabled && !input.allowPix) {
      return { error: "Habilite Pix antes de ativar a integração Asaas." };
    }

    if (input.enabled && !keyConfigured) {
      return {
        error:
          environment === "sandbox"
            ? "Configure uma chave do Sandbox (ASAAS_API_KEY_SANDBOX ou ASAAS_API_KEY com ASAAS_ENV=sandbox) antes de habilitar."
            : "Configure uma chave de Produção (ASAAS_API_KEY_PRODUCTION ou ASAAS_API_KEY com ASAAS_ENV=production) antes de habilitar.",
      };
    }

    if (input.enabled && !getAsaasWebhookToken()) {
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

    if (currentSettings.environment !== environment) {
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
      environment,
      enabled: input.enabled,
      allow_pix: input.allowPix,
      // Boleto ainda não tem provider implementado. Cartão pela fatura hospedada do Asaas já existe, mas só abre
      // com esta configuração E a chave de ativação do ambiente (JORNALIR_FINANCE_CARD_ENABLED).
      allow_boleto: false,
      allow_credit_card: input.allowCreditCard,
      credit_card_max_installments: maxInstallments,
      credit_card_min_installment_amount: Math.round(minInstallmentAmount * 100) / 100,
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
      entityId: BILLING_PROVIDER_SETTINGS_AUDIT_ID,
      action: "update",
      metadata: { ...values, apiKeyStoredInDatabase: false },
    });

    revalidatePath("/sistema/configuracoes/cobrancas");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar as configurações." };
  }
}


export async function testAsaasConnectionAction(
  requestedEnvironment: "sandbox" | "production",
): Promise<{ ok: true; generalStatus: string } | { error: string }> {
  try {
    const denied = await requireBillingSettingsAdmin();
    if (denied) return { error: denied };
    const environment = getConfiguredAsaasEnvironment() ?? requestedEnvironment;
    const key = getAsaasApiKey(environment);
    if (!key) {
      return { error: environment === "sandbox" ? "Chave do Sandbox não configurada." : "Chave de Produção não configurada." };
    }

    const baseUrl = environment === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
    const response = await fetch(`${baseUrl}/myAccount/status/`, {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "User-Agent": "InformativoRegional/1.0",
        access_token: key,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      return { error: `Asaas retornou ${response.status}: ${body.slice(0, 300)}` };
    }

    const body = (await response.json()) as { general?: string };
    return { ok: true, generalStatus: body.general ?? "conexão autenticada" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível testar a conexão com o Asaas." };
  }
}


interface AsaasWebhookRecord {
  id: string;
  name?: string;
  url?: string;
}

interface AsaasWebhookListResponse {
  data?: AsaasWebhookRecord[];
}

function asaasBaseUrl(environment: "sandbox" | "production"): string {
  return environment === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
}

async function asaasConfigurationRequest(
  environment: "sandbox" | "production",
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${asaasBaseUrl(environment)}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "InformativoRegional/1.0",
      access_token: apiKey,
      ...(init.headers ?? {}),
    },
  });
}

export async function provisionAsaasWebhookAction(
  requestedEnvironment: "sandbox" | "production",
): Promise<{ ok: true; created: boolean; webhookId: string } | { error: string }> {
  try {
    const denied = await requireBillingSettingsAdmin();
    if (denied) return { error: denied };
    const environment = getConfiguredAsaasEnvironment() ?? requestedEnvironment;
    const apiKey = getAsaasApiKey(environment);
    if (!apiKey) {
      return { error: environment === "sandbox" ? "Chave do Sandbox não configurada." : "Chave de Produção não configurada." };
    }

    const authToken = getAsaasWebhookToken();
    if (!authToken) return { error: "Token do webhook não configurado no ambiente seguro." };

    const endpoint = getAsaasWebhookEndpoint();
    if (!endpoint.startsWith("https://")) {
      return { error: "O endpoint do webhook precisa ser HTTPS antes de ser cadastrado no Asaas." };
    }

    const listResponse = await asaasConfigurationRequest(environment, apiKey, "/webhooks?offset=0&limit=100", { method: "GET" });
    if (!listResponse.ok) {
      const body = await listResponse.text();
      return { error: `Não foi possível listar os webhooks no Asaas (${listResponse.status}): ${body.slice(0, 300)}` };
    }

    const list = (await listResponse.json()) as AsaasWebhookListResponse;
    const candidates = (list.data ?? []).filter(
      (item) => item.name === ASAAS_WEBHOOK_NAME || item.url === endpoint,
    );

    if (candidates.length > 1) {
      return {
        error:
          "Há mais de um webhook do JornalIR/mesmo endpoint no Asaas. Remova a duplicidade no Asaas antes de continuar.",
      };
    }

    const existing = candidates[0];
    const commonPayload = {
      name: ASAAS_WEBHOOK_NAME,
      url: endpoint,
      enabled: true,
      interrupted: false,
      authToken,
      sendType: "SEQUENTIALLY",
      events: [...ASAAS_WEBHOOK_EVENTS],
    };

    // POST aceita/obriga o e-mail e permite apiVersion. No PUT de atualização
    // o Asaas documenta somente os campos mutáveis; não enviar email/apiVersion
    // evita rejeição por campo não suportado.
    const payload = existing
      ? commonPayload
      : {
          ...commonPayload,
          email: ASAAS_WEBHOOK_EMAIL,
          apiVersion: 3,
        };

    const response = await asaasConfigurationRequest(
      environment,
      apiKey,
      existing ? `/webhooks/${encodeURIComponent(existing.id)}` : "/webhooks",
      {
        method: existing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      return { error: `Asaas retornou ${response.status} ao configurar o webhook: ${body.slice(0, 300)}` };
    }

    const result = (await response.json()) as { id?: string };
    const webhookId = result.id ?? existing?.id;
    if (!webhookId) return { error: "O Asaas confirmou a operação, mas não retornou o identificador do webhook." };

    const client = createSupabaseServerClient();
    const audit = await getAuditContext(client);
    await recordAuditEventSupabase(client, {
      userId: audit.actorId,
      entityType: "billing_provider_settings",
      entityId: BILLING_PROVIDER_SETTINGS_AUDIT_ID,
      action: existing ? "asaas_webhook_update" : "asaas_webhook_create",
      metadata: {
        environment,
        webhookId,
        endpoint,
        events: [...ASAAS_WEBHOOK_EVENTS],
        secretStoredInDatabase: false,
      },
    });

    return { ok: true, created: !existing, webhookId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível configurar o webhook no Asaas." };
  }
}

/** Consulta sob demanda na mesma tela existente, sem IDs fornecidos pelo navegador.
 * Paginação não é automática: somente os 10 registros locais mais recentes.
 * Não confundir correspondência de status/valor com autorização de limpeza.
 */
export async function inspectAsaasExistingChargesAction():Promise<{ok:true;rows:ChargeRead[];more:boolean}|{error:string}>{
 try{
  const denied=await requireBillingSettingsAdmin();
  if(denied)return {error:denied};
  const client=createSupabaseServerClient();
  const {data:settings,error:settingsError}=await client.from("billing_provider_settings").select("environment").eq("id",1).single();
  if(settingsError||settings?.environment!=="production"||getConfiguredAsaasEnvironment()!=="production")return {error:"Consulta disponível somente no ambiente de produção confirmado."};
  const key=getAsaasApiKey("production");
  if(!key)return {error:"Chave de produção indisponível."};
  const {data,error}=await client.from("payment_charges").select("id,provider_charge_id,status,amount").eq("provider","asaas").order("created_at",{ascending:false}).order("id",{ascending:false}).limit(11);
  if(error||!data)return {error:"Não foi possível consultar as cobranças locais."};
  const rows=await inspectExistingAsaasCharges(data.slice(0,10),key);
  return {ok:true,rows,more:data.length>10};
 }catch{return {error:"Consulta Asaas indisponível."};}
}


/** Teste sem mutação, sob a mesma autorização administrativa da configuração. */
export async function testAltnixServiceBridgeAction():Promise<{ok:true;receiverWriteEnabled:boolean;senderWriteEnabled:boolean}|{error:string}>{
 try{
  const denied=await requireBillingSettingsAdmin();
  if(denied)return {error:denied};
  const health=await probeServiceBridge();
  return health?{ok:true,...health}:{error:"Comunicação indisponível. Confira a implantação e a credencial de integração."};
 }catch{return {error:"Não foi possível verificar a comunicação com o Informativo."};}
}
