/**
 * Regras de segurança do envio MANUAL de cobrança/confirmação por WhatsApp.
 * Puro e testável: decide, com o estado financeiro atual, se a mensagem pode sair.
 *
 *  - título de teste (classificado fora dos relatórios) nunca recebe mensagem ao cliente;
 *  - cobrança só com título aberto e Pix pendente VÁLIDO (nunca envia Pix expirado como válido);
 *  - nenhuma cobrança nova é criada para notificar;
 *  - reserva Pix ambígua (sem ID no provedor) bloqueia o envio;
 *  - reenvio idêntico em poucos minutos é recusado (duplo clique/corrida); falha anterior
 *    não bloqueia a nova tentativa manual.
 */
export const DUPLICATE_SEND_WINDOW_MS = 5 * 60 * 1000;
export type BillingSendKind = "billing" | "confirmation";

type GuardCharge = {
  status: string; amount: number; provider?: string; providerChargeId?: string;
  publicToken?: string; expiresAt?: string; paidAt?: string;
};
export type BillingSendInput = {
  kind: BillingSendKind;
  receivable: { status: string; balance: number; excludedFromReports: boolean };
  charges: GuardCharge[];
  recentLogs: Array<{ status: string; message: string; createdAt: string }>;
  now: number;
};
export type BillingSendDecision = { ok: true; charge: GuardCharge } | { ok: false; error: string };

/** Mensagens de confirmação começam sempre com este prefixo (ver ações e webhook). */
export const CONFIRMATION_MESSAGE_PREFIX = "Pagamento confirmado";
export const isConfirmationMessage = (message: string) => message.startsWith(CONFIRMATION_MESSAGE_PREFIX);

export function evaluateBillingSend(input: BillingSendInput): BillingSendDecision {
  const { kind, receivable, charges, recentLogs, now } = input;
  if (receivable.excludedFromReports)
    return { ok: false, error: "Este título foi classificado como teste e não recebe mensagens de clientes." };

  const duplicated = recentLogs.some((log) => log.status === "sent"
    && isConfirmationMessage(log.message) === (kind === "confirmation")
    && now - Date.parse(log.createdAt) >= 0 && now - Date.parse(log.createdAt) < DUPLICATE_SEND_WINDOW_MS);
  if (duplicated) return { ok: false, error: "Esta mensagem já foi enviada há instantes. Aguarde alguns minutos antes de reenviar." };

  if (kind === "confirmation") {
    const paid = charges.filter((c) => c.status === "paid").sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))[0];
    return paid ? { ok: true, charge: paid } : { ok: false, error: "Nenhum pagamento confirmado (Pix ou cartão) encontrado neste título." };
  }

  if (receivable.status === "cancelled") return { ok: false, error: "Título cancelado: não há cobrança a enviar." };
  if (receivable.status === "paid" || receivable.balance <= 0) return { ok: false, error: "Título já quitado: não há cobrança a enviar." };
  const pending = charges.find((c) => c.status === "pending");
  if (pending?.provider === "asaas" && !pending.providerChargeId)
    return { ok: false, error: "Criação Pix pendente de conciliação no Asaas; envio bloqueado." };
  if (!pending?.publicToken) return { ok: false, error: "Gere uma cobrança Pix antes de enviar ao cliente." };
  if (pending.expiresAt && Date.parse(pending.expiresAt) < now)
    return { ok: false, error: "O Pix desta cobrança expirou. Gere um novo Pix antes de enviar ao cliente." };
  return { ok: true, charge: pending };
}
