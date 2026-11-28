import { canonicalIdOrNull } from "./altnixFinanceReadContract";
import { OPAQUE_REF_PATTERN, PORTAL_CODE_PATTERN, trustedAsaasInvoiceUrl } from "../financeiro/cardPaymentUrls";

/**
 * Contrato da operação de pagamento do cliente do Informativo.
 * O Jornal IR continua dono de título, valor, cobrança, Asaas, confirmação e
 * recibo: aqui só se valida titularidade e elegibilidade e se devolve um
 * subconjunto seguro para o cliente. Nenhum valor, status ou cliente vindo do
 * navegador é aceito; o Informativo apenas repassa o título já conferido.
 *
 * Formas: Pix (QR/copia e cola no portal) e cartão de crédito pela FATURA HOSPEDADA do Asaas
 * (nenhum dado de cartão passa por aqui). Uma única cobrança pendente por título, de uma forma por vez.
 */
export const FINANCE_PAYMENT_VERSION = "1" as const;
/** Mínimo exigido pelo Asaas para cobrança Pix (mesmo limite da operação interna). */
export const FINANCE_PAYMENT_MIN_AMOUNT = 5;
export const JORNAL_PAYMENT_ORIGIN = "https://controle.altnix.com.br";
export const MAX_CARD_INSTALLMENTS = 12;

/** "renew" = "Gerar novo PIX"; "card" = "Pagar com cartão de crédito" (à vista ou parcelado). */
export type FinancePaymentAction = "pix" | "status" | "renew" | "card";
export type FinancePaymentRequest = {
  canonicalClientId: string; receivableId: string; action: FinancePaymentAction;
  /** Cartão: parcelas pedidas (padrão 1). Validadas contra a configuração; o total nunca muda. */
  installments?: number;
  /** Retorno ao portal depois do cartão: partes validadas; a URL é montada no Jornal (sem open redirect). */
  returnPortalCode?: string; returnRef?: string;
};

const REQUEST_KEYS = ["canonicalClientId", "receivableId", "action", "installments", "returnPortalCode", "returnRef"];

export function parseFinancePaymentRequest(raw: unknown): FinancePaymentRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !REQUEST_KEYS.includes(key))) return null;
  const canonicalClientId = canonicalIdOrNull(body.canonicalClientId);
  const receivableId = canonicalIdOrNull(body.receivableId);
  const action = body.action;
  if (!canonicalClientId || !receivableId || (action !== "pix" && action !== "status" && action !== "renew" && action !== "card")) return null;
  const request: FinancePaymentRequest = { canonicalClientId, receivableId, action };
  if (body.installments !== undefined) {
    if (action !== "card" || typeof body.installments !== "number" || !Number.isInteger(body.installments)
      || body.installments < 1 || body.installments > MAX_CARD_INSTALLMENTS) return null;
    request.installments = body.installments;
  }
  if (body.returnPortalCode !== undefined || body.returnRef !== undefined) {
    if (action !== "card" || typeof body.returnPortalCode !== "string" || !PORTAL_CODE_PATTERN.test(body.returnPortalCode)
      || typeof body.returnRef !== "string" || !OPAQUE_REF_PATTERN.test(body.returnRef)) return null;
    request.returnPortalCode = body.returnPortalCode;
    request.returnRef = body.returnRef;
  }
  return request;
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

/** Formas disponíveis AGORA (configuração central + chave de ativação do ambiente). */
export type FinancePaymentMethods = {
  pix: { enabled: boolean };
  card: { enabled: boolean; maxInstallments: number; minInstallmentAmount: number };
};
export const DEFAULT_METHODS: FinancePaymentMethods = {
  pix: { enabled: true }, card: { enabled: false, maxInstallments: 1, minInstallmentAmount: FINANCE_PAYMENT_MIN_AMOUNT },
};

export type InstallmentPlan =
  | { ok: true; installments: number; installmentAmount: number; total: number }
  | { ok: false; reason: "disabled" | "invalid" | "below_minimum" };

/** Parcelamento sem juros nem taxa inventados: o total é o saldo; cada parcela é total / n (a última absorve centavos no provedor). */
export function cardInstallmentPlan(balance: number, requested: number | undefined, card: FinancePaymentMethods["card"]): InstallmentPlan {
  if (!card.enabled) return { ok: false, reason: "disabled" };
  const installments = requested ?? 1;
  if (!Number.isInteger(installments) || installments < 1 || installments > Math.min(card.maxInstallments, MAX_CARD_INSTALLMENTS))
    return { ok: false, reason: "invalid" };
  const total = Math.round(balance * 100) / 100;
  const each = Math.round((total / installments) * 100) / 100;
  if (installments > 1 && Math.round((total / installments) * 100) < Math.round(card.minInstallmentAmount * 100))
    return { ok: false, reason: "below_minimum" };
  return { ok: true, installments, installmentAmount: each, total };
}

export type CustomerChargeState =
  | "pending" | "paid" | "expired" | "cancelled" | "failed" | "reconciling"
  /** O provedor confirmou o pagamento e a baixa ainda está sendo concluída: "Estamos confirmando seu pagamento". */
  | "confirming"
  /** Cartão recusado: o cliente pode tentar de novo na mesma página ou trocar de forma. */
  | "rejected"
  | "none";
export type CustomerCharge = {
  state: CustomerChargeState;
  method?: "pix" | "credit_card";
  amount?: number;
  pixCopyPaste?: string;
  expiresAt?: string;
  paymentUrl?: string;
  paidAt?: string;
  /** Cartão: fatura hospedada (origem do Asaas validada). */
  checkoutUrl?: string;
  installments?: number;
  installmentAmount?: number;
};

type ChargeLike = {
  status: string; amount: number; provider?: string; providerChargeId?: string;
  pixCopyPaste?: string; publicToken?: string; expiresAt?: string; paidAt?: string;
  paymentMethod?: string; invoiceUrl?: string; installmentCount?: number;
  providerConfirmedAt?: string; providerRejectedAt?: string;
};

/** Cobrança "pending" sem identificador remoto é reserva ambígua: nunca gerar outra. */
export function customerSafeCharge(charge: ChargeLike | null, now: number): CustomerCharge {
  if (!charge) return { state: "none" };
  const method = charge.paymentMethod === "credit_card" ? "credit_card" as const : "pix" as const;
  if (charge.status === "paid") return { state: "paid", method, amount: charge.amount, paidAt: charge.paidAt };
  if (charge.status === "cancelled") return { state: "cancelled", method };
  if (charge.status === "expired") return { state: "expired", method };
  if (charge.status !== "pending") return { state: "failed", method };
  if (charge.provider === "asaas" && !charge.providerChargeId) return { state: "reconciling", method };
  // Cartão confirmado pelo provedor, baixa ainda não concluída: nunca pedir novo pagamento.
  if (charge.providerConfirmedAt) return { state: "confirming", method, amount: charge.amount };
  const expired = charge.expiresAt ? Date.parse(charge.expiresAt) < now : false;
  if (expired) return { state: "expired", method, amount: charge.amount };
  if (method === "credit_card") {
    const checkoutUrl = trustedAsaasInvoiceUrl(charge.invoiceUrl);
    const installments = charge.installmentCount ?? 1;
    return {
      state: charge.providerRejectedAt ? "rejected" : "pending", method, amount: charge.amount, expiresAt: charge.expiresAt,
      installments, installmentAmount: Math.round((charge.amount / installments) * 100) / 100,
      ...(checkoutUrl ? { checkoutUrl } : {}),
    };
  }
  return {
    state: "pending", method, amount: charge.amount,
    pixCopyPaste: charge.pixCopyPaste, expiresAt: charge.expiresAt,
    ...(charge.publicToken ? { paymentUrl: `${JORNAL_PAYMENT_ORIGIN}/pagamento/${charge.publicToken}` } : {}),
  };
}

export type PayableCharge = ChargeLike & { id?: string };
export type OpenChargeResultLike =
  | { kind: "created" | "reused"; charge: PayableCharge }
  | { kind: "paid_pending_confirmation" }
  | { kind: "unsafe"; reason: string };
export type FinancePaymentDeps = {
  /** Título já filtrado por titularidade (client_id = cliente canônico); null se não pertence. */
  receivable: (PayableReceivableRow & { reference: string | null }) | null;
  charges: {
    listForReceivable(receivableId: string): Promise<PayableCharge[]>;
    openCharge(input: {
      receivableId: string; clientId: string; amount: number; description?: string;
      method: "pix" | "credit_card"; installments?: number; successUrl?: string; now: number;
    }): Promise<OpenChargeResultLike>;
  };
  methods?: FinancePaymentMethods;
  /** URL de retorno do cartão, já montada e validada no Jornal (ou nula). */
  cardSuccessUrl?: string | null;
  isAlreadyPendingError(error: unknown): boolean;
  now(): number;
};
export type FinancePaymentOutcome = { status: number; body: Record<string, unknown> };

const REASON_STATUS: Record<string, [number, string]> = {
  not_owner: [404, "not_found"], settled: [409, "settled"], excluded: [409, "ineligible"],
  ineligible: [409, "ineligible"], below_minimum: [409, "below_minimum"],
};

/**
 * Decisão de pagamento do título: uma só cobrança pendente por título; reaproveita a vigente da mesma forma,
 * troca de forma/renova só com cancelamento comprovado no provedor (PaymentChargeService.openCharge) e nunca
 * cria outra após resultado ambíguo. O valor é sempre o saldo atual. Pix expirado só é substituído pela ação
 * explícita ("renew" ou nova escolha do cliente), nunca por "pix" simples.
 */
export async function executeFinancePayment(command: FinancePaymentRequest, deps: FinancePaymentDeps): Promise<FinancePaymentOutcome> {
  const methods = deps.methods ?? DEFAULT_METHODS;
  const view = (eligibility: PaymentEligibility, charge: CustomerCharge, status = 200): FinancePaymentOutcome =>
    ({ status, body: { version: FINANCE_PAYMENT_VERSION, eligibility, charge, methods } });
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
  const open = async (method: "pix" | "credit_card", installments?: number): Promise<FinancePaymentOutcome> => {
    try {
      const opened = await deps.charges.openCharge({
        ...request, method, installments, now: deps.now(),
        successUrl: method === "credit_card" ? deps.cardSuccessUrl ?? undefined : undefined,
      });
      if (opened.kind === "paid_pending_confirmation") return view(eligibility, { state: "confirming" }, 202);
      if (opened.kind === "unsafe")
        return { status: 409, body: { error: "Não foi possível trocar ou renovar o pagamento com segurança.", code: "renewal_unsafe" } };
      return view(eligibility, customerSafeCharge(opened.charge, deps.now()));
    } catch (error) { return recover(error); }
  };

  if (command.action === "renew") return open("pix");

  if (command.action === "card") {
    const plan = cardInstallmentPlan(amount, command.installments, methods.card);
    if (!plan.ok) {
      return plan.reason === "disabled"
        ? { status: 409, body: { error: "Pagamento por cartão indisponível.", code: "method_unavailable" } }
        : { status: 409, body: { error: "Parcelamento indisponível para este valor.", code: "installments_invalid" } };
    }
    return open("credit_card", plan.installments);
  }

  // action === "pix"
  if (!methods.pix.enabled) return { status: 409, body: { error: "Pagamento por Pix indisponível.", code: "method_unavailable" } };
  // Pix expirado não é substituído às cegas: exige o pedido explícito "renew" (cancelamento comprovado).
  if (!pending && expiredLatest) return view(eligibility, customerSafeCharge(expiredLatest, deps.now()));
  const pendingExpired = Boolean(pending?.expiresAt && Date.parse(pending.expiresAt) < deps.now());
  if (pending && pendingExpired && (pending.paymentMethod ?? "pix") === "pix") return view(eligibility, customerSafeCharge(pending, deps.now()));
  return open("pix");
}
