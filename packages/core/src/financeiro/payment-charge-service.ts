import type { PaymentCharge } from "@ir/types";
import {
  PaymentChargeAlreadyPendingError,
  PaymentChargeNotFoundError,
  type ConfirmChargeResult,
  type NewPaymentChargeRecord,
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

export type RenewPixChargeResult =
  | { kind: "created"; charge: PaymentCharge }
  | { kind: "reused"; charge: PaymentCharge }
  | { kind: "paid_pending_confirmation" }
  | { kind: "unsafe"; reason: "ambiguous_reservation" | "previous_charge_not_cancelled" | "local_state_changed" };

export type OpenChargeMethod = "pix" | "credit_card";
export interface OpenChargeInput extends CreatePixChargeInput {
  method: OpenChargeMethod;
  /** Cartão: parcelas (1 = à vista). O total cobrado nunca muda. */
  installments?: number;
  /** Cartão: URL de retorno JÁ validada pelo chamador. */
  successUrl?: string;
  now?: number;
}
export type OpenChargeResult =
  | { kind: "created"; charge: PaymentCharge }
  | { kind: "reused"; charge: PaymentCharge }
  /** O provedor já recebeu ou confirmou o pagamento: nada é cancelado nem substituído; o webhook decide. */
  | { kind: "paid_pending_confirmation" }
  | { kind: "unsafe"; reason: "ambiguous_reservation" | "previous_charge_not_cancelled" | "local_state_changed" | "card_unavailable" };

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
export type SupersedeChargeResult =
  | { kind: "none" }
  | { kind: "cancelled" }
  | { kind: "blocked"; reason: "paid_or_confirmed" | "ambiguous_reservation" | "cancellation_unproven" | "local_state_changed" };

export class PaymentChargeService {
  constructor(
    private readonly charges: PaymentChargeRepository,
    private readonly provider: PixProvider,
    private readonly reserveRemoteCreation = false,
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
    if (existing) {
      if (existing.provider === "asaas" && !existing.providerChargeId)
        throw new Error("Cobrança Pix ainda não conciliada. Confira no Asaas antes de tentar novamente; não gere outra cobrança.");
      throw new PaymentChargeAlreadyPendingError();
    }

    // A reserva disputa o índice UNIQUE do banco ANTES de qualquer POST
    // ao Asaas. Falha ambígua conserva a reserva, exigindo conciliação.
    const reservation = this.reserveRemoteCreation
      ? await this.charges.create({
          receivableId: input.receivableId,
          clientId: input.clientId,
          provider: "asaas",
          amount: input.amount,
          description: input.description,
          expiresAt: input.expiresAt,
          status: "pending",
        })
      : null;

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
    const values: NewPaymentChargeRecord = {
      receivableId: input.receivableId,
      clientId: input.clientId,
      provider: providerResult.provider,
      providerChargeId: providerResult.providerChargeId,
      amount: input.amount,
      description: input.description,
      status: providerResult.status === "paid" ? "pending" : providerResult.status,
      pixCopyPaste: providerResult.pixCopyPaste,
      expiresAt: providerResult.expiresAt,
    };
    const created = reservation
      ? await this.charges.update(reservation.id, values)
      : await this.charges.create(values);

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

  /** Recuperação segura: consulta o Asaas, jamais cria cobrança externa.
   * Reserva fica intacta se não houver prova de cobrança remota. */
  async reconcilePixReservation(id: string): Promise<PaymentCharge> {
    const reserved = await this.getById(id);
    if (reserved.provider !== "asaas" || reserved.status !== "pending" || reserved.providerChargeId)
      throw new Error("Este registro não possui reserva Pix pendente de conciliação.");
    if (!this.provider.findActiveChargeForReceivable)
      throw new Error("Provedor não oferece consulta de recuperação de cobrança.");
    const remote = await this.provider.findActiveChargeForReceivable({
      receivableId: reserved.receivableId,
      clientId: reserved.clientId,
      amount: reserved.amount,
      description: reserved.description,
      expiresAt: reserved.expiresAt,
    });
    if (!remote)
      throw new Error("Cobrança não encontrada no Asaas. A reserva foi preservada; concilie manualmente antes de liberar outra tentativa.");
    if (remote.provider !== "asaas" || remote.status === "failed")
      throw new Error("Cobrança remota com situação incompatível. Concilie antes de alterar a reserva.");
    // Se já foi paga, o pagamento só é registrado pela RPC com service_role
    // no webhook autenticado. Não gerar receipt pela sessão do operador.
    return this.charges.update(id, {
      providerChargeId: remote.providerChargeId,
      status: remote.status === "paid" ? "pending" : remote.status,
      pixCopyPaste: remote.pixCopyPaste,
      expiresAt: remote.expiresAt,
    });
  }

  /**
   * Renovação de Pix expirado solicitada EXPLICITAMENTE pelo cliente (sem job, sem polling).
   * Só emite substituta quando a cobrança anterior comprovadamente não pode mais ser paga:
   *  - cobrança vigente é reaproveitada (nada é cancelado nem recriado);
   *  - cobrança anterior (pendente expirada ou expirada) é cancelada no provedor e só então
   *    substituída; se o cancelamento falhar, o estado remoto é consultado uma vez:
   *    paga → aguarda o webhook (nada é emitido), cancelada → segue, qualquer outro → "unsafe";
   *  - reserva ambígua (sem ID remoto) nunca é substituída: exige conciliação pelo operador;
   *  - a reserva da nova cobrança disputa o índice único (uma pendente por título), então
   *    pedidos concorrentes convergem para a mesma cobrança.
   * O cancelamento por cliente não tem operador: grava motivo fixo e `cancelled_by` nulo,
   * aceito pelo schema; nenhuma identidade administrativa é emprestada. Histórico preservado.
   */
  async renewExpiredPixCharge(input: CreatePixChargeInput & { now?: number }): Promise<RenewPixChargeResult> {
    const now = input.now ?? Date.now();
    const history = await this.charges.listForReceivable(input.receivableId);
    const latest = history[0] ?? null;
    const create = async (): Promise<RenewPixChargeResult> => {
      const request: CreatePixChargeInput = {
        receivableId: input.receivableId, clientId: input.clientId, amount: input.amount,
        description: input.description, expiresAt: input.expiresAt,
      };
      try {
        return { kind: "created", charge: await this.createPixCharge(request) };
      } catch (error) {
        // Renovação concorrente: o índice único já garantiu uma só cobrança pendente.
        if (error instanceof PaymentChargeAlreadyPendingError) {
          const current = await this.charges.findPendingForReceivable(input.receivableId);
          if (current) return { kind: "reused", charge: current };
        }
        throw error;
      }
    };

    if (!latest || (latest.status !== "pending" && latest.status !== "expired")) return create();
    const expired = latest.status === "expired" || (latest.expiresAt !== undefined && Date.parse(latest.expiresAt) < now);
    if (latest.status === "pending" && !expired) return { kind: "reused", charge: latest };
    if (latest.provider === "asaas" && !latest.providerChargeId) return { kind: "unsafe", reason: "ambiguous_reservation" };

    if (latest.providerChargeId) {
      try {
        await this.provider.cancelCharge(latest.providerChargeId);
      } catch {
        // Após timeout o provedor pode ter cancelado (ou recebido). Uma consulta decide.
        let remote: Awaited<ReturnType<PixProvider["getCharge"]>>["status"] | undefined;
        try { remote = (await this.provider.getCharge(latest.providerChargeId)).status; } catch { remote = undefined; }
        if (remote === "paid") return { kind: "paid_pending_confirmation" };
        if (remote !== "cancelled") return { kind: "unsafe", reason: "previous_charge_not_cancelled" };
      }
    }
    if (latest.status === "pending") {
      try {
        await this.charges.update(latest.id, {
          status: "cancelled",
          cancelledAt: new Date(now).toISOString(),
          cancellationReason: "renovacao_solicitada_pelo_cliente",
        });
      } catch {
        // Mudou durante a operação (webhook pagou ou outra renovação concluiu): reavaliar sem criar às cegas.
        const current = await this.charges.findPendingForReceivable(input.receivableId);
        if (current && current.id !== latest.id) return { kind: "reused", charge: current };
        const after = await this.charges.getById(latest.id);
        if (after?.status === "paid") return { kind: "paid_pending_confirmation" };
        if (after?.status !== "cancelled") return { kind: "unsafe", reason: "local_state_changed" };
      }
    }
    return create();
  }

  /**
   * Cobrança de cartão pela fatura hospedada. Mesma garantia do Pix: a reserva disputa o índice único
   * (uma cobrança pendente por título, de qualquer forma) ANTES de chamar o provedor; falha ambígua conserva
   * a reserva. Nenhum dado de cartão passa por aqui.
   */
  async createCardCharge(input: CreatePixChargeInput & { installments: number; successUrl?: string }): Promise<PaymentCharge> {
    if (!this.provider.createCardCharge) throw new Error("Pagamento por cartão indisponível neste ambiente.");
    const existing = await this.charges.findPendingForReceivable(input.receivableId);
    if (existing) {
      if (existing.provider === "asaas" && !existing.providerChargeId)
        throw new Error("Cobrança ainda não conciliada. Confira no Asaas antes de tentar novamente; não gere outra cobrança.");
      throw new PaymentChargeAlreadyPendingError();
    }
    const base = {
      receivableId: input.receivableId, clientId: input.clientId, amount: input.amount,
      description: input.description, expiresAt: input.expiresAt,
    };
    const reservation = this.reserveRemoteCreation
      ? await this.charges.create({
          ...base, provider: "asaas", status: "pending", paymentMethod: "credit_card", installmentCount: input.installments,
        })
      : null;
    const result = await this.provider.createCardCharge({ ...base, installments: input.installments, successUrl: input.successUrl });
    const values: NewPaymentChargeRecord = {
      ...base, provider: result.provider, providerChargeId: result.providerChargeId, status: "pending",
      paymentMethod: "credit_card", invoiceUrl: result.invoiceUrl, installmentCount: input.installments,
      providerInstallmentId: result.providerInstallmentId, expiresAt: result.expiresAt ?? input.expiresAt,
    };
    return reservation ? this.charges.update(reservation.id, values) : this.charges.create(values);
  }

  /**
   * Abre (ou reaproveita) a ÚNICA cobrança pendente do título na forma escolhida pelo cliente.
   *  - mesma forma e vigente → reaproveita (nada novo no provedor);
   *  - outra forma, parcelas diferentes ou expirada → cancela a anterior no provedor e SÓ ENTÃO emite a nova;
   *    se o cancelamento falhar, uma consulta decide: recebida/confirmada → nada é substituído (o webhook
   *    decide); cancelada → segue; qualquer outro resultado → recusa segura (`unsafe`);
   *  - reserva ambígua (sem ID no provedor) nunca é substituída;
   *  - cartão já confirmado pelo provedor nunca é cancelado;
   *  - pedidos concorrentes convergem no índice único.
   * Cancelamento por cliente não tem operador: motivo fixo e `cancelled_by` nulo (aceito pelo schema).
   */
  async openCharge(input: OpenChargeInput): Promise<OpenChargeResult> {
    const now = input.now ?? Date.now();
    const installments = input.method === "credit_card" ? Math.max(1, input.installments ?? 1) : undefined;
    const request = {
      receivableId: input.receivableId, clientId: input.clientId, amount: input.amount,
      description: input.description, expiresAt: input.expiresAt,
    };
    const create = async (): Promise<OpenChargeResult> => {
      try {
        const charge = input.method === "credit_card"
          ? await this.createCardCharge({ ...request, installments: installments!, successUrl: input.successUrl })
          : await this.createPixCharge(request);
        return { kind: "created", charge };
      } catch (error) {
        if (error instanceof PaymentChargeAlreadyPendingError) {
          const current = await this.charges.findPendingForReceivable(input.receivableId);
          if (current) return { kind: "reused", charge: current };
        }
        throw error;
      }
    };

    const history = await this.charges.listForReceivable(input.receivableId);
    const latest = history[0] ?? null;
    if (!latest || (latest.status !== "pending" && latest.status !== "expired")) return create();

    const latestMethod = latest.paymentMethod ?? "pix";
    const expired = latest.status === "expired" || (latest.expiresAt !== undefined && Date.parse(latest.expiresAt) < now);
    const ambiguous = latest.provider === "asaas" && !latest.providerChargeId;
    if (latest.status === "pending" && latest.providerConfirmedAt && !latest.paidAt) return { kind: "paid_pending_confirmation" };
    const sameChoice = latestMethod === input.method && (input.method === "pix" || (latest.installmentCount ?? 1) === installments);
    if (latest.status === "pending" && !expired && sameChoice && (ambiguous || latestMethod === "pix" || latest.invoiceUrl))
      return { kind: "reused", charge: latest };
    if (ambiguous) return { kind: "unsafe", reason: "ambiguous_reservation" };

    if (latest.providerChargeId) {
      try {
        await this.provider.cancelCharge(latest.providerChargeId);
      } catch {
        let remote: Awaited<ReturnType<PixProvider["getCharge"]>> | undefined;
        try { remote = await this.provider.getCharge(latest.providerChargeId); } catch { remote = undefined; }
        if (remote && (remote.status === "paid" || remote.confirmed)) return { kind: "paid_pending_confirmation" };
        if (remote?.status !== "cancelled") return { kind: "unsafe", reason: "previous_charge_not_cancelled" };
      }
    }
    if (latest.status === "pending") {
      try {
        await this.charges.update(latest.id, {
          status: "cancelled",
          cancelledAt: new Date(now).toISOString(),
          cancellationReason: expired ? "renovacao_solicitada_pelo_cliente" : "troca_de_forma_de_pagamento_pelo_cliente",
        });
      } catch {
        const current = await this.charges.findPendingForReceivable(input.receivableId);
        if (current && current.id !== latest.id) return { kind: "reused", charge: current };
        const after = await this.charges.getById(latest.id);
        if (after?.status === "paid") return { kind: "paid_pending_confirmation" };
        if (after?.status !== "cancelled") return { kind: "unsafe", reason: "local_state_changed" };
      }
    }
    return create();
  }

  /** Inspeção SOMENTE local (nenhuma chamada ao provedor): há cobrança que impeça a reestruturação? */
  async inspectChargeForRestructuring(receivableId: string): Promise<"none" | "cancellable" | Extract<SupersedeChargeResult, { kind: "blocked" }>["reason"]> {
    const latest = (await this.charges.listForReceivable(receivableId))[0] ?? null;
    if (!latest) return "none";
    if (latest.status === "paid") return "paid_or_confirmed";
    if (latest.status !== "pending" && latest.status !== "expired") return "none";
    if (latest.status === "pending" && latest.providerConfirmedAt && !latest.paidAt) return "paid_or_confirmed";
    if (latest.provider === "asaas" && !latest.providerChargeId) return "ambiguous_reservation";
    return "cancellable";
  }

  /**
   * Libera o título para reestruturação administrativa: cancela a cobrança externa ativa (Pix ou cartão) SOMENTE
   * com prova de cancelamento. Mesmas proteções do openCharge/renovação:
   *  - cobrança paga, confirmada pelo provedor ou recebida → bloqueia (o webhook decide; nada é substituído);
   *  - reserva ambígua (sem ID no provedor) → bloqueia;
   *  - falha/timeout no cancelamento → consulta; só "cancelada" libera; qualquer outra resposta bloqueia;
   *  - estado local mudou durante a operação → relê e só libera se já estiver cancelada.
   * Nunca cria cobrança substituta aqui. Idempotente: sem cobrança ativa → { kind: "none" }.
   */
  async supersedeActiveCharge(receivableId: string, input: { cancelledByProfileId?: string; reason: string; now?: number }): Promise<SupersedeChargeResult> {
    const now = input.now ?? Date.now();
    const history = await this.charges.listForReceivable(receivableId);
    const latest = history[0] ?? null;
    if (!latest) return { kind: "none" };
    if (latest.status === "paid") return { kind: "blocked", reason: "paid_or_confirmed" };
    if (latest.status !== "pending" && latest.status !== "expired") return { kind: "none" };
    if (latest.status === "pending" && latest.providerConfirmedAt && !latest.paidAt) return { kind: "blocked", reason: "paid_or_confirmed" };
    if (latest.provider === "asaas" && !latest.providerChargeId) return { kind: "blocked", reason: "ambiguous_reservation" };
    if (latest.providerChargeId) {
      try {
        await this.provider.cancelCharge(latest.providerChargeId);
      } catch {
        let remote: Awaited<ReturnType<PixProvider["getCharge"]>> | undefined;
        try { remote = await this.provider.getCharge(latest.providerChargeId); } catch { remote = undefined; }
        if (remote && (remote.status === "paid" || remote.confirmed)) return { kind: "blocked", reason: "paid_or_confirmed" };
        if (remote?.status !== "cancelled") return { kind: "blocked", reason: "cancellation_unproven" };
      }
    }
    if (latest.status === "pending") {
      try {
        await this.charges.update(latest.id, {
          status: "cancelled", cancelledAt: new Date(now).toISOString(),
          cancelledByProfileId: input.cancelledByProfileId, cancellationReason: input.reason,
        });
      } catch {
        const after = await this.charges.getById(latest.id);
        if (after?.status === "paid") return { kind: "blocked", reason: "paid_or_confirmed" };
        if (after?.status !== "cancelled") return { kind: "blocked", reason: "local_state_changed" };
      }
    }
    return { kind: "cancelled" };
  }

  async cancelPixCharge(id: string, input: CancelPixChargeInput): Promise<PaymentCharge> {
    const charge = await this.getById(id);
    if(charge.status==="paid")
      throw new Error("Cobrança Pix já paga: não é permitido cancelá-la. Use a conciliação/estorno financeiro apropriado.");
    if(charge.status!=="pending") return charge;
    // Sem ID externo não existe prova de que o Asaas não tenha emitido.
    if(charge.provider === "asaas" && !charge.providerChargeId)
      throw new Error("Pix sem conciliação no Asaas. Confira a cobrança remota antes de cancelar ou emitir outra.");
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
