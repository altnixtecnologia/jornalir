"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient, hasServiceRoleKey } from "../../../../lib/supabase/admin";
import { AI_MODULES, readAiModes } from "../../../../features/configuracoes/aiSettingsTypes";
import type { AiModuleKey } from "../../../../features/configuracoes/aiSettingsTypes";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

type ProposalStatus = "pending" | "approved" | "rejected";
export type AssistantProposal = {
  id: string;
  title: string;
  module: AiModuleKey;
  rationale: string;
  status: ProposalStatus;
  createdAt: string;
};
const URL = "/sistema/assistente-ir/propostas";
const AUDIT_ID = "00000000-0000-4000-8000-000000000201";

async function ownerSession() {
  const db = createSupabaseServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error("Sessão expirada. Entre novamente.");
  const { data: profile } = await db.from("profiles")
    .select("role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || profile.role !== "owner") throw new Error("Acesso reservado ao proprietário.");
  return { db, userId: user.id };
}

/** Lista propostas de leitura e avaliação. Nunca executa o conteúdo armazenado. */
export async function listAssistantProposalsAction(): Promise<
  { ok: true; data: AssistantProposal[] } | { error: string }
> {
  try {
    const { db } = await ownerSession();
    const { data, error } = await db.from("ai_approval_requests")
      .select("id,module_key,title,rationale,status,requested_at")
      .in("action_code", ["manual_ai_review", "daily_digest"])
      .order("requested_at", { ascending: false }).limit(80);
    if (error) return { error: "Não foi possível consultar as propostas." };
    return { ok: true, data: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      module: row.module_key as AiModuleKey,
      rationale: row.rationale || "",
      status: row.status as ProposalStatus,
      createdAt: row.requested_at,
    })) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível abrir a central." };
  }
}

/** O proprietário registra uma sugestão de IA para REVISÃO, jamais execução. */
export async function saveAssistantProposalAction(
  input: { module: AiModuleKey; title: string; rationale: string },
): Promise<{ ok: true } | { error: string }> {
  try {
    const { db, userId } = await ownerSession();
    if (!input || !AI_MODULES.some((item) => item.key === input.module)
      || typeof input.title !== "string" || typeof input.rationale !== "string") {
      return { error: "Preencha uma proposta válida." };
    }
    const title = input.title.trim(), rationale = input.rationale.trim();
    if (title.length < 4 || title.length > 180 || rationale.length < 6 || rationale.length > 1800) {
      return { error: "Informe título (4–180) e descrição (6–1.800 caracteres)." };
    }
    const { data: settings, error: settingsError } = await db.from("ai_assistant_settings")
      .select("enabled,module_modes").eq("id", 1).maybeSingle();
    if (settingsError || !settings?.enabled || readAiModes(settings.module_modes)[input.module] === "off") {
      return { error: "Ligue o Assistente IR e habilite o módulo dessa proposta antes de salvá-la." };
    }
    if (!hasServiceRoleKey()) return { error: "O servidor não está configurado para salvar propostas." };
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("ai_approval_requests").insert({
      module_key: input.module,
      action_code: "manual_ai_review",
      title, rationale,
      status: "pending",
      context: { source: "owner_chat", requested_by: userId, executable: false },
    });
    if (error) return { error: "Não foi possível registrar a proposta." };
    await recordAuditEventSupabase(db, {
      userId, entityType: "ai_approval_requests", entityId: AUDIT_ID, action: "propose",
      metadata: { module: input.module, executable: false },
    });
    revalidatePath(URL);
    return { ok: true };
  } catch {
    return { error: "Não foi possível registrar a proposta. Verifique a sessão e tente novamente." };
  }
}

/** Aprovação de CONTEÚDO para revisão. Não executa ações no sistema. */
export async function decideAssistantProposalAction(
  id: string, decision: "approved" | "rejected",
): Promise<{ ok: true } | { error: string }> {
  try {
    const { db, userId } = await ownerSession();
    if (typeof id !== "string"
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
      || (decision !== "approved" && decision !== "rejected")) return { error: "Solicitação inválida." };
    if (!hasServiceRoleKey()) return { error: "Servidor indisponível para registrar decisão." };
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("ai_approval_requests")
      .update({ status: decision, resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending")
      .in("action_code", ["manual_ai_review", "daily_digest"])
      .select("id").maybeSingle();
    if (error || !data) return { error: "Essa proposta não está pendente ou já foi revisada." };
    await recordAuditEventSupabase(db, {
      userId, entityType: "ai_approval_requests", entityId: id,
      action: decision, metadata: { executable: false },
    });
    revalidatePath(URL);
    return { ok: true };
  } catch {
    return { error: "Não foi possível registrar a decisão." };
  }
}
