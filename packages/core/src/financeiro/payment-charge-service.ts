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
 * A confirmação real é acionada pelo webhook Asaas autenticado fora
 * deste módulo de serviço. A ação demonstrativa de confirmação está
 * restrita ao preview local. A atomicidade
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

    // Se o provedor já devolver a cobrança como paga (caso típico de
    // recuperação após timeout: o Asaas criou/recebeu, mas o registro
    // local não chegou a ser persistido), grava primeiro como pending e
    // passa pela MESMA confirmação atômica usada pelo webhook. Assim o
    // receipt e o saldo do título nunca ficam para trás de um status
    // "paid" gravado isoladamente.
    const created = await this.charges.create({
      receivableId: input.receivableId,
      clientId: input.clientId,
      provider: providerResult.provider,
      providerChargeId: providerResult.providerChargeId,
      amount: input.amount,
      description: input.description,
      status: providerResult.status === "paid" ? "pending" : providerResult.status,
      pixCopyPaste: providerResult.pixCopyPaste,
      expiresAt: providerResult.expiresAt,
    });

    if (providerResult.status === "paid") {
      // Recuperação de uma cobrança previamente recebida no Asaas:
      // usuário com autorização apenas de "gerar Pix" NÃO pode nem deve
      // invocar confirm_payment_charge via sessão comum (a RPC requer
      // service_role). Persistir como pending para que o webhook autenticado
      // execute a liquidação automática transacional. Isso preserva a
      // referência remota para conciliação em vez de falhar após o INSERT.
      return created;
    }

    return created;
  }

  async cancelPixCharge(id: string, input: CancelPixChargeInput): Promise<PaymentCharge> {
    const charge = await this.getById(id);
    if(charge.status==="paid")
      throw new Error("Cobrança Pix já paga: não é permitido cancelá-la. Use a conciliação/estorno financeiro apropriado.");
    if(charge.status!=="pending") return charge;
    if(charge.providerChargeId){
      try {
        await this.provider.cancelCharge(charge.providerChargeId);
      } catch(error){
        // Após timeout, o Asaas pode ter cancelado remotamente sem que
        // a atualização local tenha ocorrido. Nunca presumir sucesso:
        // consultar o estado remoto e aceitar SOMENTE cancelado.
        let remoteStatus: "pending"|"paid"|"expired"|"cancelled"|"failed"|undefined;
        try {
          const remote=await this.provider.getCharge(charge.providerChargeId);
          remoteStatus=remote.status;
        } catch {
          // Sem prova do cancelamento não mudar o registro local.
        }
        if(remoteStatus==="paid")
          throw new Error("Cobrança já recebida no Asaas; não é possível cancelá-la. Aguarde a conciliação do pagamento.");
        if(remoteStatus!=="cancelled"&&remoteStatus!=="expired") throw error;
      }
    }
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
   * pelo webhook Asaas autenticado (service_role), ou simulada apenas
   * no preview local. Não usar para baixa manual de cobrança real.
   */
  async confirmPixCharge(id: string, receivedAt: string, receivedByProfileId?: string): Promise<ConfirmChargeResult> {
    return this.charges.confirmCharge(id, { receivedAt, receivedByProfileId });
  }
}
