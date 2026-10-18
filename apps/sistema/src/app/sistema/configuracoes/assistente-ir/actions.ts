"use server";

import { revalidatePath } from "next/cache";
import { getFinancialOverviewSupabase } from "../../../../providers/supabase/financialOverview.supabase";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient, hasServiceRoleKey } from "../../../../lib/supabase/admin";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";
import {
  encryptAssistantKey, hasAssistantEncryptionKey, getAssistantCredentialForConnectionTest,
} from "../../../../lib/ai/assistantConfig";
import {
  AI_MODULES, validAiMode, readAiModes,
} from "../../../../features/configuracoes/aiSettingsTypes";
import type {
  AiProvider, AiSettingsInput, AiOperationalBrief,
} from "../../../../features/configuracoes/aiSettingsTypes";

const PATH = "/sistema/configuracoes/assistente-ir";
const AUDIT_ID = "00000000-0000-4000-8000-000000000201";
type Result = { ok: true } | { error: string };

async function requireOwner() {
  const db = createSupabaseServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error("Sessao expirada. Entre novamente.");
  const { data: profile } = await db.from("profiles")
    .select("role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || profile.role !== "owner") {
    throw new Error("Somente o proprietario pode configurar o Assistente IR.");
  }
  return { db, userId: user.id };
}

function validateProvider(value: unknown): value is AiProvider {
  return value === "openai" || value === "anthropic";
}

export async function updateAssistantSettingsAction(input: AiSettingsInput): Promise<Result> {
  try {
    const { db, userId } = await requireOwner();
    if (!input || typeof input.enabled !== "boolean" || !validateProvider(input.provider)) {
      return { error: "Configuracao invalida." };
    }
    const model = String(input.model || "").trim();
    if (!/^[A-Za-z0-9._:/-]{2,100}$/.test(model)) {
      return { error: "Informe um identificador de modelo valido (ate 100 caracteres)." };
    }
    if (!input.modes || typeof input.modes !== "object"
      || !AI_MODULES.every((item) => validAiMode(input.modes[item.key]))) {
      return { error: "Informe o modo de funcionamento de todos os modulos." };
    }
    if (!hasServiceRoleKey()) return { error: "Configure SUPABASE_SERVICE_ROLE_KEY no servidor." };
    const modes = Object.fromEntries(AI_MODULES.map((item) => [item.key, input.modes[item.key]]));
    if (input.enabled) {
      if (!hasAssistantEncryptionKey()) return { error: "Configure o cofre AI_CONFIG_ENCRYPTION_KEY antes de ativar a IA." };
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.from("ai_provider_credentials")
        .select("provider").eq("provider", input.provider).maybeSingle();
      if (error || !data) return { error: "Cadastre primeiro a chave do provedor selecionado." };
    }
    const { data: saved, error: saveError } = await db.from("ai_assistant_settings")
      .update({
        enabled: input.enabled, provider: input.provider, model,
        module_modes: modes, updated_by: userId, updated_at: new Date().toISOString(),
      }).eq("id", 1).select("id").maybeSingle();
    if (saveError || !saved) return { error: "Nao foi possivel salvar. Verifique a migration do Assistente IR." };
    await recordAuditEventSupabase(db, {
      userId, entityType: "ai_assistant_settings", entityId: AUDIT_ID, action: "update",
      metadata: { enabled: input.enabled, provider: input.provider, model, modes },
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Nao foi possivel alterar a configuracao." };
  }
}

/** Grava UMA credencial cifrada, nunca registra ou retorna o segredo. */
export async function saveAssistantProviderKeyAction(
  provider: AiProvider, plainKey: string,
): Promise<Result> {
  try {
    const { db, userId } = await requireOwner();
    if (!validateProvider(provider) || typeof plainKey !== "string") return { error: "Provedor invalido." };
    const key = plainKey.trim();
    if (key.length < 12 || key.length > 1024 || /[\r\n]/.test(key)) {
      return { error: "Informe uma chave de API valida, sem quebras de linha." };
    }
    if (!hasServiceRoleKey() || !hasAssistantEncryptionKey()) {
      return { error: "O cofre de credenciais precisa estar configurado no servidor." };
    }
    const encrypted = encryptAssistantKey(key);
    const admin = createSupabaseAdminClient();
    const { error: saveError } = await admin.from("ai_provider_credentials").upsert({
      provider, encrypted_key: encrypted, updated_by: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "provider" });
    if (saveError) return { error: "Nao foi possivel salvar a chave no cofre." };
    await recordAuditEventSupabase(db, {
      userId, entityType: "ai_provider_credentials", entityId: AUDIT_ID,
      action: "key_replace", metadata: { provider, secretIncluded: false },
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Nao foi possivel salvar a chave." };
  }
}

/** Teste EXPLICITO do proprietario, sem chamada de geracao nem
 * cobrança do sistema. Consulta somente endpoint de listagem de modelos.
 * Funciona mesmo com assistente desligado, sem ativa-lo. */
export async function testAssistantConnectionAction(
  provider: AiProvider,
): Promise<{ ok: true; message: string } | { error: string }> {
  try {
    const { db, userId } = await requireOwner();
    if (!validateProvider(provider)) return { error: "Provedor invalido." };
    const apiKey = await getAssistantCredentialForConnectionTest(provider);
    const url = provider === "openai"
      ? "https://api.openai.com/v1/models?limit=1"
      : "https://api.anthropic.com/v1/models?limit=1";
    const headers: Record<string, string> = provider === "openai"
      ? { authorization: `Bearer ${apiKey}` }
      : { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET", headers, cache: "no-store", signal: AbortSignal.timeout(10000),
      });
    } catch {
      return { error: "Nao foi possivel conectar ao provedor em ate 10 segundos. Confira rede e acesso da API." };
    }
    const ok = response.ok;
    // NUNCA devolve corpo de erro de terceiros, pois pode conter dados internos.
    const status = response.status;
    await recordAuditEventSupabase(db, {
      userId, entityType: "ai_provider_credentials", entityId: AUDIT_ID,
      action: "connection_test",
      metadata: { provider, success: ok, status },
    });
    if (!ok) {
      return { error: `O provedor retornou HTTP ${status}. Confira a chave e permissoes da conta de API.` };
    }
    return { ok: true, message: `Conexao com ${provider === "openai" ? "OpenAI" : "Claude"} autenticada. Nenhuma mensagem foi gerada.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao testar a conexao." };
  }
}

/** Resumo sob demanda, sem enviar dados para OpenAI/Claude. Todos os acessos
 * usam a sessao do owner, com RLS, e respeitam o interruptor geral e os
 * modos por modulo. Somente metricas agregadas, sem dados pessoais. */
export async function getAssistantOperationalBriefAction():
  Promise<{ ok: true; data: AiOperationalBrief } | { error: string }> {
  try {
    const { db } = await requireOwner();
    const { data: config, error } = await db.from("ai_assistant_settings")
      .select("enabled,module_modes").eq("id", 1).maybeSingle();
    if (error || !config) return { error: "A configuracao do Assistente IR ainda nao esta disponivel." };
    if (!config.enabled) return { error: "Ative o Assistente IR para consultar os modulos habilitados." };
    const modes = readAiModes(config.module_modes);
    if (["financeiro", "site", "agenda"].every((key) =>
      modes[key as "financeiro" | "site" | "agenda"] === "off")) {
      return { error: "Ative Financeiro, Pedidos do site ou Agenda para consultar o resumo." };
    }

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
    }).formatToParts(new Date());
    const dateParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    const endDate = new Date(`${today}T12:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const nextSevenEnd = endDate.toISOString().slice(0, 10);

    const financeiro: AiOperationalBrief["financeiro"] = modes.financeiro === "off"
      ? null : await (async () => {
        const overview = await getFinancialOverviewSupabase(db, {
          today, periodStart: today, periodEnd: today, monthStart: today, monthEnd: today,
        });
        return {
          overdueCount: overview.overdueCount,
          overdueAmount: overview.totalOverdueAmount,
          receivedTodayCount: overview.receivedToday.count,
          receivedTodayAmount: overview.receivedToday.amount,
        };
      })();
    let site: AiOperationalBrief["site"] = null;
    if (modes.site !== "off") {
      const { count, error: countError } = await db.from("site_interest_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["new", "contacted"]).is("attended_at", null);
      if (countError || count === null) throw new Error("Nao foi possivel conferir as solicitacoes do site.");
      site = { unattendedRequests: count };
    }

    let agenda: AiOperationalBrief["agenda"] = null;
    if (modes.agenda !== "off") {
      const [todayResult, weekResult] = await Promise.all([
        db.from("agenda_events").select("id", { count: "exact", head: true })
          .eq("status", "scheduled").eq("event_date", today),
        db.from("agenda_events").select("id", { count: "exact", head: true })
          .eq("status", "scheduled").gte("event_date", today).lte("event_date", nextSevenEnd),
      ]);
      if (todayResult.error || weekResult.error || todayResult.count === null || weekResult.count === null) {
        throw new Error("Nao foi possivel conferir a Agenda.");
      }
      agenda = {
        scheduledToday: todayResult.count,
        scheduledNextSevenDays: weekResult.count,
      };
    }

    return { ok: true, data: { generatedAt: new Date().toISOString(), financeiro, site, agenda } };
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message : "Nao foi possivel preparar o resumo operacional.",
    };
  }
}
