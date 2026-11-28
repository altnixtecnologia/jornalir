/**
 * Destinatário de WhatsApp do cadastro mestre (Jornal IR) — política única, igual à do Informativo
 * (`normalizeWhatsAppContact`):
 *
 *    WhatsApp canônico válido  -> destinatário autorizado
 *    WhatsApp ausente          -> indisponível
 *    WhatsApp inválido         -> indisponível
 *
 * Não existe fallback para o telefone principal: ele pode ser fixo ou de outra pessoa, e a mensagem
 * só vai para o número que o cliente cadastrou como WhatsApp. Números são normalizados para
 * DDD + número nacional (10/11 dígitos); o DDI 55 é acrescentado apenas no formato de envio.
 */
export type WhatsappRecipient =
  | { ok: true; national: string; e164: string }
  | { ok: false; reason: "no_whatsapp" | "whatsapp_invalid" };

/** DDD brasileiro válido. */
const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92,
  93, 94, 95, 96, 97, 98, 99,
]);

/** DDD + número (10 ou 11 dígitos) ou null. Aceita +55/55 e pontuação; nunca corrige dígitos. */
export function normalizeBrazilWhatsappNumber(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (!/^[1-9][0-9]{9,10}$/.test(digits)) return null;
  if (!VALID_DDD.has(Number(digits.slice(0, 2)))) return null;
  return digits;
}

export function resolveClientWhatsappRecipient(client: { whatsapp?: string | null }): WhatsappRecipient {
  if (typeof client.whatsapp !== "string" || client.whatsapp.trim() === "") return { ok: false, reason: "no_whatsapp" };
  const national = normalizeBrazilWhatsappNumber(client.whatsapp);
  return national ? { ok: true, national, e164: `55${national}` } : { ok: false, reason: "whatsapp_invalid" };
}

export const WHATSAPP_RECIPIENT_MESSAGES: Record<"no_whatsapp" | "whatsapp_invalid", string> = {
  no_whatsapp: "Este cliente não tem WhatsApp cadastrado. Cadastre o WhatsApp no cadastro do cliente para enviar mensagens.",
  whatsapp_invalid: "O WhatsApp cadastrado para este cliente é inválido. Corrija o número no cadastro do cliente antes de enviar.",
};
