import type { PaymentCharge } from "@ir/types";
import {
  PaymentChargeAlreadyPendingError,
  PaymentChargeNotFoundError,
  type ConfirmChargeResult,
  type PaymentChargeRepository,
} from "./payment-charge-repository";
import type { CreatePixChargeRequest, PixProvider } from "./pix-provider";

export interface CreatePixChargeInput {
  receivableId: string;
  clientId: string;
  amount: number;
  description?: string;
  expiresAt?: string;
}

export interface CancelPixChargeInput {
  cancelledByProfileId: string;
  cancellationReason: string;
}

/**
 * Ciclo de vida de uma cobrança Pix (criar/cancelar/confirmar) — nunca
 * chama o provedor real sem necessidade, nunca cria um receipt duplicado.
 * `confirmPixCharge` é a arquitetura preparada pra uma futura confirmação
 * (webhook do provedor real ou ação manual "Marcar como paga"); NENHUM
 * webhook real é implementado aqui (item 12/13 da tarefa). A atomicidade
 * sob concorrência (nunca duas baixas pra mesma cobrança) é garantida
 * pelo REPOSITÓRIO (RPC `confirm_payment_charge`, com lock de linha no
 * banco) — este service nunca monta o receipt em múltiplos passos
 * separados, delega a operação inteira.
 */
export class PaymentChargeService {
  constructor(
    private readonly charges: PaymentChargeRepository,
    private readonly provider: PixProvider,
  ) {}

  async getById(id: string): Promise<PaymentCharge> {
    const charge = await this.charges.getById(id);
    if (!charge) throw new PaymentChargeNotFoundError(id);
    return charge;
  }

  listForReceivable(receivableId: string): Promise<PaymentCharge[]> {
    return this.charges.listForReceivable(receivableId);
  }

  /** Por padrão o valor sugerido é o saldo total do título (item 23) — quem chama decide se envia um valor menor (cobrança parcial). */
  async createPixCharge(input: CreatePixChargeInput): Promise<PaymentCharge> {
    const existing = await this.charges.findPendingForReceivable(input.receivableId);
    if (existing) throw new PaymentChargeAlreadyPendingError();

    const providerResult = await this.provider.createCharge({
      receivableId: input.receivableId,
      clientId: input.clientId,
      amount: input.amount,
      description: input.description,
      expiresAt: input.expiresAt,
    } satisfies CreatePixChargeRequest);

    return this.charges.create({
      receivableId: input.receivableId,
      clientId: input.clientId,
      provider: "pix_manual",
      providerChargeId: providerResult.providerChargeId,
      amount: input.amount,
      description: input.description,
      status: providerResult.status,
      pixCopyPaste: providerResult.pixCopyPaste,
      expiresAt: providerResult.expiresAt,
    });
  }

  async cancelPixCharge(id: string, input: CancelPixChargeInput): Promise<PaymentCharge> {
    const charge = await this.getById(id);
    if (charge.status !== "pending") return charge;
    if (charge.providerChargeId) await this.provider.cancelCharge(charge.providerChargeId);
    return this.charges.update(id, {
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledByProfileId: input.cancelledByProfileId,
      cancellationReason: input.cancellationReason,
    });
  }

  /**
   * Confirma o pagamento de uma cobrança — IDEMPOTENTE SOB CONCORRÊNCIA:
   * a operação inteira (achar a cobrança, criar o receipt, atualizar a
   * cobrança) acontece numa única chamada atômica no repositório (fora
   * do preview, a RPC `confirm_payment_charge` com lock de linha; em
   * preview, a simulação local equivalente). Preparado pra ser chamado
   * por uma futura confirmação automática (webhook do provedor real) ou
   * por uma ação manual; nenhuma das duas está implementada nesta fase.
   */
  async confirmPixCharge(id: string, receivedAt: string, receivedByProfileId?: string): Promise<ConfirmChargeResult> {
    return this.charges.confirmCharge(id, { receivedAt, receivedByProfileId });
  }
}
