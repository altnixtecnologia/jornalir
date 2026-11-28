import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Callback de status de entrega do WhatsApp Cloud API (Meta). Funções puras:
 *  - autenticidade: X-Hub-Signature-256 = HMAC-SHA256 do corpo BRUTO com o App Secret;
 *  - verificação de inscrição (GET hub.challenge) com token próprio;
 *  - extração dos status (sent/delivered/read/failed). Duplicados e eventos fora de ordem são
 *    resolvidos no banco (`whatsapp_apply_delivery_event`), nunca aqui.
 * "delivered"/"read" só existem se vierem destes eventos autênticos.
 */
export const MAX_WEBHOOK_BYTES = 256 * 1024;
export const MAX_STATUS_EVENTS = 200;

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || appSecret.length < 16 || !header || !header.startsWith("sha256=")) return false;
  const supplied = header.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(supplied.toLowerCase()), Buffer.from(expected));
}

/** Resposta ao desafio de inscrição; null se modo/token não conferem. */
export function webhookChallenge(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken || verifyToken.length < 16) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  const supplied = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge") ?? "";
  if (supplied.length !== verifyToken.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(verifyToken))) return null;
  return /^[A-Za-z0-9_-]{1,200}$/.test(challenge) ? challenge : null;
}

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";
export type DeliveryEvent = { messageId: string; status: DeliveryStatus; at: string; errorCode: string | null; error: string | null };

const KNOWN: DeliveryStatus[] = ["sent", "delivered", "read", "failed"];

export function parseDeliveryEvents(body: unknown): DeliveryEvent[] {
  const events: DeliveryEvent[] = [];
  const entries = (body as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return events;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const statuses = (change as { value?: { statuses?: unknown } })?.value?.statuses;
      if (!Array.isArray(statuses)) continue; // mensagens recebidas e outros campos são ignorados
      for (const item of statuses) {
        const s = item as { id?: unknown; status?: unknown; timestamp?: unknown; errors?: unknown };
        if (typeof s.id !== "string" || !s.id || s.id.length > 200) continue;
        if (!KNOWN.includes(s.status as DeliveryStatus)) continue;
        const seconds = Number(s.timestamp);
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 4_102_444_800) continue;
        const firstError = Array.isArray(s.errors) ? (s.errors[0] as { code?: unknown; title?: unknown; message?: unknown } | undefined) : undefined;
        events.push({
          messageId: s.id, status: s.status as DeliveryStatus, at: new Date(seconds * 1000).toISOString(),
          errorCode: firstError?.code !== undefined ? String(firstError.code).slice(0, 60) : null,
          error: typeof (firstError?.message ?? firstError?.title) === "string" ? String(firstError?.message ?? firstError?.title).slice(0, 500) : null,
        });
        if (events.length >= MAX_STATUS_EVENTS) return events;
      }
    }
  }
  return events;
}
