"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient, hasServiceRoleKey } from "../../../../lib/supabase/admin";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";
import {
  encryptAssistantKey, hasAssistantEncryptionKey,
} from "../../../../lib/ai/assistantConfig";
import {
  AI_MODULES, validAiMode,
} from "../../../../features/configuracoes/aiSettingsTypes";
import type {
  AiProvider, AiSettingsInput,
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
