import type { PaymentCharge } from "@ir/types";

export type NewPaymentChargeRecord = Omit<PaymentCharge, "id" | "createdAt" | "updatedAt">;
export type PaymentChargeChanges = Partial<NewPaymentChargeRecord>;

export class PaymentChargeNotFoundError extends Error {
  constructor(id: string) {
    super(`Cobrança não encontrada: ${id}`);
  }
}

/** Já existe uma cobrança pendente para este título — reforçado também por índice único parcial no banco (payment_charges_one_pending_per_receivable). */
export class PaymentChargeAlreadyPendingError extends Error {
  constructor() {
    super("Já existe cobrança Pix pendente para este título. Cancele-a antes de gerar uma nova.");
  }
}

export interface ConfirmChargeInput {
  receivedAt: string;
  receivedByProfileId?: string;
}

export interface ConfirmChargeResult {
  charge: PaymentCharge;
  /** Ausente só no caso extremo em que o saldo já era zero quando a cobrança confirmou — nesse caso o valor inteiro virou crédito (ver overpaymentAmount), nenhum receipt foi criado. */
  receiptId?: string;
  /** true quando a cobrança já tinha sido confirmada antes (idempotência) — nenhum receipt/crédito novo foi criado. */
  alreadyConfirmed: boolean;
  /**
   * Parte do valor da cobrança que excedeu o saldo do título no momento
   * da confirmação (ex.: saldo mudou por um pagamento manual registrado
   * entre a criação da cobrança e a confirmação) — nunca aplicada como
   * receipt além do saldo; sempre virada em client_credits (0 quando não
   * há excedente).
   */
  overpaymentAmount: number;
  /** Preenchido quando overpaymentAmount > 0 — id do client_credits criado (ou já existente, se já confirmada). */
  creditId?: string;
}

export interface PaymentChargeRepository {
  getById(id: string): Promise<PaymentCharge | null>;
  listForReceivable(receivableId: string): Promise<PaymentCharge[]>;
  /** Cobrança com status='pending' para este título, se houver — no máximo uma por vez (ver índice único parcial). */
  findPendingForReceivable(receivableId: string): Promise<PaymentCharge | null>;
  create(record: NewPaymentChargeRecord): Promise<PaymentCharge>;
  update(id: string, changes: PaymentChargeChanges): Promise<PaymentCharge>;
  /**
   * Confirma o pagamento de forma ATÔMICA (fora do preview, via RPC
   * `confirm_payment_charge` — lock de linha no banco, idempotente sob
   * concorrência). NUNCA cria um receipt maior que o saldo atual do
   * título (ver overpaymentAmount); o excedente vira client_credits na
   * MESMA transação. Em preview, simula localmente o mesmo contrato,
   * incluindo o excedente. Nunca cria um segundo receipt/crédito pra uma
   * cobrança já confirmada.
   */
  confirmCharge(id: string, input: ConfirmChargeInput): Promise<ConfirmChargeResult>;
}
