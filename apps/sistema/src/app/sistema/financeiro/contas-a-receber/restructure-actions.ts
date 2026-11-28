"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { checkFinanceAction } from "../../../../lib/permissions/checkFinanceAction";
import { checkModuleAction } from "../../../../lib/permissions/checkModuleAction";
import { isLocalPreviewEnabled } from "../../../../lib/auth/localPreview";
import { canonicalIdOrNull } from "../../../../lib/integrations/altnixFinanceReadContract";
import { parseRestructureCommand, type RestructureOutcome } from "../../../../lib/financeiro/receivableRestructuring";
import { executeRestructuring } from "../../../../lib/financeiro/receivableRestructuringRuntime";

export type RestructureActionResult = RestructureOutcome | { ok: false; code: "denied" | "disabled" | "invalid" | "unavailable"; error: string };

/**
 * "Unificar cobranças" / "Dividir cobrança" — ação administrativa. O cliente NUNCA chega aqui (portal não tem essa rota).
 * Exige as duas permissões financeiras existentes (criar e cancelar títulos), sessão de equipe ativa e confirmação
 * explícita para aplicar. A prévia não tem efeitos. A aplicação fica desligada até JORNALIR_RESTRUCTURING_ENABLED=true.
 */
export async function restructureReceivablesAction(raw: unknown): Promise<RestructureActionResult> {
  const command = parseRestructureCommand(raw);
  if (!command) return { ok: false, code: "invalid", error: "Revise a seleção, as parcelas, o motivo e a confirmação." };
  if (isLocalPreviewEnabled()) return { ok: false, code: "unavailable", error: "Indisponível no modo de demonstração." };
  if (!command.preview && process.env.JORNALIR_RESTRUCTURING_ENABLED !== "true")
    return { ok: false, code: "disabled", error: "A reestruturação de cobranças ainda não foi habilitada." };
  for (const permission of ["titulos_criar", "titulos_cancelar"] as const) {
    const denied = await checkFinanceAction(permission);
    if (denied) return { ok: false, code: "denied", error: denied };
  }
  try {
    const session = createSupabaseServerClient();
    const { data: auth, error } = await session.auth.getUser();
    if (error || !auth.user) return { ok: false, code: "denied", error: "Sessão inválida. Faça login novamente." };
    const { data: profile } = await session.from("profiles").select("active").eq("id", auth.user.id).maybeSingle();
    if (!profile?.active) return { ok: false, code: "denied", error: "Usuário sem acesso ativo." };
    const outcome = await executeRestructuring(createSupabaseAdminClient(), auth.user.id, command);
    if (outcome.ok && outcome.applied) {
      revalidatePath("/sistema/financeiro/contas-a-receber");
      revalidatePath("/sistema/publicidade/vendas");
    }
    return outcome;
  } catch {
    return { ok: false, code: "unavailable", error: "Não foi possível concluir agora. Nada foi alterado." };
  }
}

/** Explícito e idempotente: calcula a composição por serviço dos títulos de uma compra (sem tocar cobranças externas). */
export async function prepareSaleAllocationsAction(saleId: string): Promise<{ ok: true; prepared: number } | { ok: false; error: string }> {
  if (canonicalIdOrNull(saleId) !== saleId) return { ok: false, error: "Compra inválida." };
  if (isLocalPreviewEnabled()) return { ok: false, error: "Indisponível no modo de demonstração." };
  const denied = await checkFinanceAction("titulos_criar");
  if (denied) return { ok: false, error: denied };
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("altnix_allocate_sale_receivables", { p_sale: saleId });
    if (error || typeof data !== "number") return { ok: false, error: "Não foi possível preparar a composição." };
    if (data < 0) return { ok: false, error: "A composição não pôde ser comprovada: confira se a contratação (serviços) está preparada e se os valores dos itens somam o valor da compra." };
    revalidatePath(`/sistema/publicidade/vendas/${saleId}`);
    return { ok: true, prepared: data };
  } catch {
    return { ok: false, error: "Composição indisponível agora." };
  }
}

/** Tolerância global (0–30). Reservado ao proprietário, igual às demais decisões operacionais. */
export async function configureDefaultToleranceAction(days: number | null, confirmed: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (confirmed !== true || (days !== null && (!Number.isInteger(days) || days < 0 || days > 30))) return { ok: false, error: "Confirme e informe a tolerância de 0 a 30 dias." };
  const denied = await checkModuleAction("publicidade", "contratos_revisar");
  if (denied) return { ok: false, error: denied };
  try {
    const session = createSupabaseServerClient();
    const { data: auth } = await session.auth.getUser();
    if (!auth.user) return { ok: false, error: "Sessão inválida." };
    const { data: profile } = await session.from("profiles").select("role,active").eq("id", auth.user.id).maybeSingle();
    if (!profile?.active || profile.role !== "owner") return { ok: false, error: "Operação reservada ao proprietário." };
    const { data, error } = await createSupabaseAdminClient().rpc("altnix_configure_finance_default", { p_actor: auth.user.id, p_days: days });
    return !error && data === true ? { ok: true } : { ok: false, error: "Tolerância padrão não registrada." };
  } catch {
    return { ok: false, error: "Tolerância indisponível agora." };
  }
}
