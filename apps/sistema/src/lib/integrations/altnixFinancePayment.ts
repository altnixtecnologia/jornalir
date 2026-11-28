import { canonicalIdOrNull } from "./altnixFinanceReadContract";

/**
 * Contrato da operação de pagamento do cliente do Informativo.
 * O Jornal IR continua dono de título, valor, cobrança, Asaas, confirmação e
 * recibo: aqui só se valida titularidade e elegibilidade e se devolve um
 * subconjunto seguro para o cliente. Nenhum valor, status ou cliente vindo do
 * navegador é aceito; o Informativo apenas repassa o título já conferido.
 */
export const FINANCE_PAYMENT_VERSION = "1" as const;
/** Mínimo exigido pelo Asaas para cobrança Pix (mesmo limite da operação interna). */
export const FINANCE_PAYMENT_MIN_AMOUNT = 5;
export const JORNAL_PAYMENT_ORIGIN = "https://controle.altnix.com.br";

/** "renew" = "Gerar novo PIX": pedido explícito do cliente quando o anterior expirou. */
export type FinancePaymentAction = "pix" | "status" | "renew";
export type FinancePaymentRequest = { canonicalClientId: string; receivableId: string; action: FinancePaymentAction };

export function parseFinancePaymentRequest(raw: unknown): FinancePaymentRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => !["canonicalClientId", "receivableId", "action"].includes(key))) return null;
  const canonicalClientId = canonicalIdOrNull(body.canonicalClientId);
  const receivableId = canonicalIdOrNull(body.receivableId);
  if (!canonicalClientId || !receivableId || (body.action !== "pix" && body.action !== "status" && body.action !== "renew")) return null;
  return { canonicalClientId, receivableId, action: body.action };
}

export type PayableReceivableRow = {
  clientId: string;
  status: string;
  balance: number;
  sourceType: string | null;
  commercialSaleId: string | null;
  excludedFromReports: boolean;
};

export type PaymentEligibility = "eligible" | "not_owner" | "settled" | "excluded" | "ineligible" | "below_minimum";

/** Elegibilidade decidida com o estado financeiro atual; títulos de teste
 * classificados, quitados, cancelados ou fora do escopo comercial não são pagáveis.
 * Pagamento sempre do saldo integral: a venda conjunta é um único título global. */
export function receivablePaymentEligibility(row: PayableReceivableRow, canonicalClientId: string): PaymentEligibility {
  if (row.clientId !== canonicalClientId) return "not_owner";
  if (row.excludedFromReports) return "excluded";
  if (row.status === "paid") return "settled";
  if (row.status !== "open" && row.status !== "partially_paid") return "ineligible";
  if (row.sourceType !== "advertising" || !row.commercialSaleId) return "ineligible";
  if (!Number.isFinite(row.balance) || row.balance <= 0) return "settled";
  if (Math.round(row.balance * 100) < FINANCE_PAYMENT_MIN_AMOUNT * 100) return "below_minimum";
  return "eligible";
}

export type CustomerChargeState = "pending" | "paid" | "expired" | "cancelled" | "failed" | "reconciling" | "none";
export type CustomerCharge = {
  state: CustomerChargeState;
  amount?: number;
  pixCopyPaste?: string;
  expiresAt?: string;
  paymentUrl?: string;
  paidAt?: string;
};

type ChargeLike = {
  status: string; amount: number; provider?: string; providerChargeId?: string;
  pixCopyPaste?: string; publicToken?: string; expiresAt?: string; paidAt?: string;
};

/** Cobrança "pending" sem identificador remoto é reserva ambígua: nunca gerar outra. */
export function customerSafeCharge(charge: ChargeLike | null, now: number): CustomerCharge {
  if (!charge) return { state: "none" };
  if (charge.status === "paid") return { state: "paid", amount: charge.amount, paidAt: charge.paidAt };
  if (charge.status === "cancelled") return { state: "cancelled" };
  if (charge.status === "expired") return { state: "expired" };
  if (charge.status !== "pending") return { state: "failed" };
  if (charge.provider === "asaas" && !charge.providerChargeId) return { state: "reconciling" };
  const expired = charge.expiresAt ? Date.parse(charge.expiresAt) < now : false;
  return {
    state: expired ? "expired" : "pending",
    amount: charge.amount,
    ...(expired ? {} : { pixCopyPaste: charge.pixCopyPaste, expiresAt: charge.expiresAt }),
    ...(!expired && charge.publicToken ? { paymentUrl: `${JORNAL_PAYMENT_ORIGIN}/pagamento/${charge.publicToken}` } : {}),
  };
}

export type PayableCharge = ChargeLike & { id?: string };
export type RenewResultLike =
  | { kind: "created" | "reused"; charge: PayableCharge }
  | { kind: "paid_pending_confirmation" }
  | { kind: "unsafe"; reason: string };
export type FinancePaymentDeps = {
  /** Título já filtrado por titularidade (client_id = cliente canônico); null se não pertence. */
  receivable: (PayableReceivableRow & { reference: string | null }) | null;
  charges: {
    listForReceivable(receivableId: string): Promise<PayableCharge[]>;
    createPixCharge(input: { receivableId: string; clientId: string; amount: number; description?: string }): Promise<PayableCharge>;
    renewExpiredPixCharge(input: { receivableId: string; clientId: string; amount: number; description?: string; now: number }): Promise<RenewResultLike>;
  };
  isAlreadyPendingError(error: unknown): boolean;
  now(): number;
};
export type FinancePaymentOutcome = { status: number; body: Record<string, unknown> };

const REASON_STATUS: Record<string, [number, string]> = {
  not_owner: [404, "not_found"], settled: [409, "settled"], excluded: [409, "ineligible"],
  ineligible: [409, "ineligible"], below_minimum: [409, "below_minimum"],
};

/**
 * Decisão de pagamento do título: reaproveita cobrança pendente (inclusive reserva ambígua),
 * cria no máximo uma cobrança por título (o índice único do banco resolve a corrida) e
 * nunca cria outra após resultado ambíguo do gateway. O valor é sempre o saldo atual.
 * Pix expirado só é substituído pela ação explícita "renew", que comprova que a anterior
 * não pode mais ser paga (PaymentChargeService.renewExpiredPixCharge).
 */
export async function executeFinancePayment(command: FinancePaymentRequest, deps: FinancePaymentDeps): Promise<FinancePaymentOutcome> {
  const view = (eligibility: PaymentEligibility, charge: CustomerCharge, status = 200): FinancePaymentOutcome =>
    ({ status, body: { version: FINANCE_PAYMENT_VERSION, eligibility, charge } });
  const unavailable: FinancePaymentOutcome = { status: 503, body: { error: "Pagamento temporariamente indisponível.", code: "unavailable" } };
  if (!deps.receivable) return { status: 404, body: { error: "Título não encontrado.", code: "not_found" } };

  const eligibility = receivablePaymentEligibility(deps.receivable, command.canonicalClientId);
  const history = await deps.charges.listForReceivable(command.receivableId);
  const latest = history[0] ?? null;
  const pending = history.find((charge) => charge.status === "pending") ?? null;
  const paid = history.find((charge) => charge.status === "paid") ?? null;
  const expiredLatest = latest?.status === "expired" ? latest : null;

  if (command.action === "status") {
    // Cobrança paga só é relevante com o título de fato quitado (pagamento parcial anterior não conta).
    return view(eligibility, customerSafeCharge(pending ?? (eligibility === "settled" ? paid : null) ?? expiredLatest, deps.now()));
  }
  if (eligibility !== "eligible") {
    if (pending && eligibility === "below_minimum" && command.action === "pix")
      return view(eligibility, customerSafeCharge(pending, deps.now()));
    const [status, code] = REASON_STATUS[eligibility];
    return { status, body: { error: "Este título não está disponível para pagamento.", code } };
  }

  const amount = Math.round(deps.receivable.balance * 100) / 100;
  const request = { receivableId: command.receivableId, clientId: command.canonicalClientId, amount, description: deps.receivable.reference ?? undefined };
  const recover = async (error: unknown): Promise<FinancePaymentOutcome> => {
    // Clique concorrente (índice único) ou resultado ambíguo do gateway: reaproveitar a reserva existente.
    const existing = (await deps.charges.listForReceivable(command.receivableId).catch(() => [] as PayableCharge[]))
      .find((charge) => charge.status === "pending") ?? null;
    if (existing) return view(eligibility, customerSafeCharge(existing, deps.now()), deps.isAlreadyPendingError(error) ? 200 : 202);
    return unavailable;
  };

  if (command.action === "renew") {
    try {
      const renewed = await deps.charges.renewExpiredPixCharge({ ...request, now: deps.now() });
      if (renewed.kind === "paid_pending_confirmation") return view(eligibility, { state: "reconciling" }, 202);
      if (renewed.kind === "unsafe")
        return { status: 409, body: { error: "Não foi possível gerar um novo PIX com segurança.", code: "renewal_unsafe" } };
      return view(eligibility, customerSafeCharge(renewed.charge, deps.now()));
    } catch (error) { return recover(error); }
  }

  if (pending) return view(eligibility, customerSafeCharge(pending, deps.now()));
  // Pix expirado não é substituído às cegas: exige o pedido explícito "renew" (cancelamento comprovado).
  if (expiredLatest) return view(eligibility, customerSafeCharge(expiredLatest, deps.now()));
  try {
    return view(eligibility, customerSafeCharge(await deps.charges.createPixCharge(request), deps.now()));
  } catch (error) { return recover(error); }
}
