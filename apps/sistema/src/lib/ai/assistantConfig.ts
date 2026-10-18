import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createSupabaseAdminClient, hasServiceRoleKey } from "../supabase/admin";
import {
  AI_DEFAULT_MODELS, DEFAULT_AI_MODULE_MODES, readAiModes,
} from "../../features/configuracoes/aiSettingsTypes";
import type {
  AiModuleKey, AiProvider, AiSettingsSnapshot,
} from "../../features/configuracoes/aiSettingsTypes";

export class AssistantConfigurationError extends Error {}

function encryptionKey(): Buffer {
  const raw = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (!raw) throw new AssistantConfigurationError("Cofre de chaves nao configurado no servidor.");
  const decoded = Buffer.from(raw.trim(), "base64");
  if (decoded.length !== 32) {
    throw new AssistantConfigurationError("AI_CONFIG_ENCRYPTION_KEY deve conter 32 bytes em base64.");
  }
  return decoded;
}

export function hasAssistantEncryptionKey(): boolean {
  try { encryptionKey(); return true; } catch { return false; }
}

/** AES-256-GCM: IV novo por gravação, tag autenticada; nunca salvar texto puro. */
export function encryptAssistantKey(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), payload.toString("base64")].join(":");
}

function decryptAssistantKey(ciphertext: string): string {
  try {
    const [version, iv, tag, payload, extra] = ciphertext.split(":");
    if (version !== "v1" || !iv || !tag || !payload || extra !== undefined) throw new Error("Formato");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new AssistantConfigurationError("Nao foi possivel decifrar a chave da IA. Confira o cofre do servidor.");
  }
}

/** Exibe apenas presença das chaves, jamais o valor; chamar somente apos
 * confirmar no servidor que a sessao e do proprietario ativo. */
export async function loadAssistantOwnerSnapshot(): Promise<AiSettingsSnapshot> {
  const defaults: AiSettingsSnapshot = {
    enabled: false, provider: "openai", model: AI_DEFAULT_MODELS.openai,
    modes: { ...DEFAULT_AI_MODULE_MODES }, configuredKeys: { openai: false, anthropic: false },
    encryptionAvailable: hasAssistantEncryptionKey(), backendAvailable: false, pendingApprovals: 0,
  };
  if (!hasServiceRoleKey()) return defaults;
  const db = createSupabaseAdminClient();
  const [settings, credentials, approvals] = await Promise.all([
    db.from("ai_assistant_settings").select("enabled,provider,model,module_modes").eq("id", 1).maybeSingle(),
    db.from("ai_provider_credentials").select("provider"),
    db.from("ai_approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (settings.error || !settings.data || credentials.error || approvals.error) return defaults;
  return {
    enabled: Boolean(settings.data.enabled),
    provider: settings.data.provider === "anthropic" ? "anthropic" : "openai",
    model: String(settings.data.model || AI_DEFAULT_MODELS.openai),
    modes: readAiModes(settings.data.module_modes),
    configuredKeys: {
      openai: (credentials.data ?? []).some((item) => item.provider === "openai"),
      anthropic: (credentials.data ?? []).some((item) => item.provider === "anthropic"),
    },
    encryptionAvailable: hasAssistantEncryptionKey(),
    backendAvailable: true,
    pendingApprovals: approvals.count ?? 0,
  };
}

/** Guarda obrigatoria no SERVIDOR. Todo job, rota, integracao e operacao de
 * IA deve solicitar a credencial atraves desta funcao. Sem configuracao,
 * global OFF ou modulo OFF = nenhuma chamada externa. */
export async function getAssistantCredentialsForModule(
  moduleKey: AiModuleKey,
): Promise<{ provider: AiProvider; model: string; apiKey: string }> {
  if (!hasServiceRoleKey()) throw new AssistantConfigurationError("Assistente IR indisponivel no servidor.");
  const db = createSupabaseAdminClient();
  const { data: settings, error } = await db.from("ai_assistant_settings")
    .select("enabled,provider,model,module_modes").eq("id", 1).maybeSingle();
  if (error || !settings || !settings.enabled) {
    throw new AssistantConfigurationError("O Assistente IR esta desativado ou ainda nao configurado.");
  }
  const modes = readAiModes(settings.module_modes);
  if (modes[moduleKey] === "off") {
    throw new AssistantConfigurationError("A IA esta desativada para este modulo.");
  }
  const provider: AiProvider = settings.provider === "anthropic" ? "anthropic" : "openai";
  const { data: credential, error: credentialError } = await db
    .from("ai_provider_credentials").select("encrypted_key").eq("provider", provider).maybeSingle();
  if (credentialError || !credential?.encrypted_key) {
    throw new AssistantConfigurationError("Configure a chave de API do provedor selecionado.");
  }
  const apiKey = decryptAssistantKey(credential.encrypted_key);
  if (!apiKey) throw new AssistantConfigurationError("Chave de API vazia.");
  return {
    provider,
    model: String(settings.model || AI_DEFAULT_MODELS[provider]),
    apiKey,
  };
}

export async function isAssistantConfiguredForModule(moduleKey: AiModuleKey): Promise<boolean> {
  try { await getAssistantCredentialsForModule(moduleKey); return true; } catch { return false; }
}
