import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyResendWebhook } from "./verifyResendWebhook";

/**
 * Recebimento dos eventos do Resend (confirmação de entrega).
 * Responsabilidade ÚNICA: atualizar tentativas de e-mail JÁ existentes, localizadas pelo
 * identificador do provedor. Nunca envia e-mail, nunca emite/consulta nota, nunca devolve dado fiscal.
 * Independe da liberação da emissão fiscal: só exige RESEND_WEBHOOK_SECRET e assinatura Svix válida.
 */
export type WebhookStatus = "delivered" | "bounced" | "failed";
type Rule = { status: WebhookStatus; allowedFrom: string[]; summary: string; field: "delivered_at" | "failed_at" };

/**
 * Máquina de estados (só avança; nunca regride):
 *  accepted -> delivered | bounced | failed
 *  delivered -> bounced (devolução tardia) | complained
 *  bounced/failed -> complained (reclamação posterior)
 * Um "delivered" atrasado NUNCA sobrescreve bounced/failed. Reentregas do mesmo evento não alteram nada
 * (a condição de estado atual não casa) — e a troca é um UPDATE condicional atômico (sem corrida).
 */
const RULES: Record<string, Rule> = {
  "email.delivered": { status: "delivered", allowedFrom: ["accepted"], summary: "Entrega confirmada pelo provedor.", field: "delivered_at" },
  "email.bounced": { status: "bounced", allowedFrom: ["accepted", "delivered"], summary: "Provedor informou devolução (bounce) da mensagem.", field: "failed_at" },
  "email.failed": { status: "failed", allowedFrom: ["accepted"], summary: "Provedor informou falha no envio da mensagem.", field: "failed_at" },
  "email.complained": { status: "bounced", allowedFrom: ["accepted", "delivered", "failed", "bounced"], summary: "Destinatário marcou a mensagem como spam (reclamação).", field: "failed_at" },
};

export interface WebhookInput {
  rawBody: string;
  headers: { id: string | null; timestamp: string | null; signature: string | null };
  secret: string | undefined;
  /** Só é chamado DEPOIS da assinatura validada. */
  getAdmin: () => SupabaseClient;
  nowMs?: number;
}
export interface WebhookResult { status: number; body: Record<string, unknown> }

function eventTimeIso(created: unknown, nowMs: number): string {
  if (typeof created === "string") {
    const t = Date.parse(created);
    // Aceita o horário do evento se plausível (nunca no futuro além de 5 min); senão, usa o atual.
    if (Number.isFinite(t) && t <= nowMs + 300_000 && t > Date.UTC(2020, 0, 1)) return new Date(t).toISOString();
  }
  return new Date(nowMs).toISOString();
}
function isMissingRelation(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message ?? "");
}

export async function handleResendWebhook(input: WebhookInput): Promise<WebhookResult> {
  if (!input.secret) return { status: 503, body: { error: "Recebimento não configurado." } };
  if (input.rawBody.length > 100_000 || !verifyResendWebhook({
    rawBody: input.rawBody, messageId: input.headers.id, timestamp: input.headers.timestamp,
    signatures: input.headers.signature, secret: input.secret,
    nowSeconds: Math.floor((input.nowMs ?? Date.now()) / 1000),
  })) return { status: 401, body: { error: "Assinatura inválida." } };

  let payload: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
  try { payload = JSON.parse(input.rawBody); } catch { return { status: 400, body: { error: "JSON inválido." } }; }
  const rule = typeof payload.type === "string" ? RULES[payload.type] : undefined;
  const messageId = payload.data?.email_id;
  // Eventos que não usamos (sent, opened, clicked...) ou sem identificador: reconhecer sem agir.
  if (!rule || typeof messageId !== "string" || !messageId || messageId.length > 200) return { status: 200, body: { received: true } };

  const nowMs = input.nowMs ?? Date.now();
  const at = eventTimeIso(payload.created_at, nowMs);
  const update: Record<string, unknown> = { status: rule.status, response_summary: rule.summary, updated_at: new Date(nowMs).toISOString() };
  update[rule.field] = at;

  const { data, error } = await input.getAdmin().from("nfse_delivery_attempts")
    .update(update)
    .eq("channel", "email").eq("provider", "resend").eq("provider_message_id", messageId)
    .in("status", rule.allowedFrom)
    .select("id");
  if (error) {
    // Tabela ainda inexistente (migration não aplicada): 503 para o Resend repetir depois, sem perder o evento.
    if (isMissingRelation(error)) return { status: 503, body: { error: "Histórico de entrega ainda não disponível." } };
    return { status: 500, body: { error: "Falha ao registrar evento." } };
  }
  // 0 linhas = identificador desconhecido OU evento repetido/antigo (estado já igual ou mais avançado): 200, sem alteração.
  return { status: 200, body: { received: true, updated: (data ?? []).length } };
}
