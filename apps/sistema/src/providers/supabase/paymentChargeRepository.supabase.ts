import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientCreditWithBalance, PaymentCharge, PaymentChargeProvider, PaymentChargeStatus } from "@ir/types";
import { PaymentChargeAlreadyPendingError, type ConfirmChargeInput, type ConfirmChargeResult, type NewPaymentChargeRecord, type PaymentChargeChanges, type PaymentChargeRepository } from "@ir/core";
import { isLocalPreviewEnabled } from "../../lib/auth/localPreview";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { PREVIEW_RECEIVABLES, PREVIEW_RECEIPTS } from "./receivableRepository.supabase";
import { PREVIEW_CLIENT_CREDITS } from "./clientCreditRepository.supabase";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const TABLE = "payment_charges";
const COLUMNS =
  "id, receivable_id, client_id, provider, provider_charge_id, amount, description, status, pix_copy_paste, public_token, " +
  "expires_at, paid_at, receipt_id, cancelled_at, cancelled_by, cancellation_reason, created_by, created_at, updated_at";

interface PaymentChargeRow {
  id: string;
  receivable_id: string;
  client_id: string;
  provider: PaymentChargeProvider;
  provider_charge_id: string | null;
  amount: number;
  description: string | null;
  status: PaymentChargeStatus;
  pix_copy_paste: string | null;
  public_token: string | null;
  expires_at: string | null;
  paid_at: string | null;
  receipt_id: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toDomain(row: PaymentChargeRow): PaymentCharge {
  return {
    id: row.id,
    receivableId: row.receivable_id,
    clientId: row.client_id,
    provider: row.provider,
    providerChargeId: row.provider_charge_id ?? undefined,
    amount: Number(row.amount),
    description: row.description ?? undefined,
    status: row.status,
    pixCopyPaste: row.pix_copy_paste ?? undefined,
    publicToken: row.public_token ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    paidAt: row.paid_at ?? undefined,
    receiptId: row.receipt_id ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelledByProfileId: row.cancelled_by ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    createdByProfileId: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: NewPaymentChargeRecord | PaymentChargeChanges): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (record.receivableId !== undefined) row.receivable_id = record.receivableId;
  if (record.clientId !== undefined) row.client_id = record.clientId;
  if (record.provider !== undefined) row.provider = record.provider;
  if (record.providerChargeId !== undefined) row.provider_charge_id = record.providerChargeId ?? null;
  if (record.amount !== undefined) row.amount = record.amount;
  if (record.description !== undefined) row.description = record.description ?? null;
  if (record.status !== undefined) row.status = record.status;
  if (record.pixCopyPaste !== undefined) row.pix_copy_paste = record.pixCopyPaste ?? null;
  if (record.expiresAt !== undefined) row.expires_at = record.expiresAt ?? null;
  if (record.paidAt !== undefined) row.paid_at = record.paidAt ?? null;
  if (record.receiptId !== undefined) row.receipt_id = record.receiptId ?? null;
  if (record.cancelledAt !== undefined) row.cancelled_at = record.cancelledAt ?? null;
  if (record.cancelledByProfileId !== undefined) row.cancelled_by = record.cancelledByProfileId ?? null;
  if (record.cancellationReason !== undefined) row.cancellation_reason = record.cancellationReason ?? null;
  return row;
}

// Preview — em memória só pela duração do processo (sem persistência real,
// mesmo princípio dos outros módulos em SYSTEM_LOCAL_PREVIEW=1). Cada
// "Gerar cobrança Pix" no preview acrescenta uma linha aqui.
//
// Semeado com UMA cobrança pendente de demonstração (cenário "saldo mudou
// depois que o Pix foi criado" — ver relatório da tarefa): R$ 500 sobre
// preview-titulo-5, que já tem R$ 200 pagos em dinheiro (saldo R$ 300).
// Confirmar esta cobrança no preview mostra o excedente virando crédito.
const previewCharges: PaymentCharge[] = [
  {
    id: "preview-pix-charge-1",
    receivableId: "preview-titulo-5",
    clientId: "preview-cliente-1",
    provider: "pix_manual",
    providerChargeId: "preview-pix-charge-1-provider",
    amount: 500,
    description: "Cobrança Pix de demonstração — criada antes do pagamento em dinheiro",
    status: "pending",
    pixCopyPaste:
      "00020126580014BR.GOV.BCB.PIX0136preview-demo-seed520400005303986540500.005802BR5913JORNAL IR DEMO6009SAO PAULO62070503***6304PREV",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

export function createPaymentChargeRepositorySupabase(client: SupabaseClient): PaymentChargeRepository {
  return {
    async getById(id) {
      if (isLocalPreviewEnabled()) return previewCharges.find((c) => c.id === id) ?? null;
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as PaymentChargeRow) : null;
    },

    async listForReceivable(receivableId) {
      if (isLocalPreviewEnabled()) return previewCharges.filter((c) => c.receivableId === receivableId);
      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("receivable_id", receivableId).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => toDomain(row as unknown as PaymentChargeRow));
    },

    async findPendingForReceivable(receivableId) {
      if (isLocalPreviewEnabled()) return previewCharges.find((c) => c.receivableId === receivableId && c.status === "pending") ?? null;
      const { data, error } = await client
        .from(TABLE)
        .select(COLUMNS)
        .eq("receivable_id", receivableId)
        .eq("status", "pending")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDomain(data as unknown as PaymentChargeRow) : null;
    },

    async create(record) {
      if (isLocalPreviewEnabled()) {
        const charge: PaymentCharge = {
          ...record,
          id: `preview-pix-charge-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        previewCharges.push(charge);
        return charge;
      }
      // Nunca expor INSERT direto de cobrança ao operador (nem ao admin).
      // A Server Action validou pix_gerar, cliente, saldo e título antes
      // de chamar este repositório; só ela usa a chave service_role.
      const writer = createSupabaseAdminClient();
      const { data, error } = await writer.from(TABLE).insert(toRow(record)).select(COLUMNS).single();
      if (error?.code === "23505") throw new PaymentChargeAlreadyPendingError();
      if (error) throw new Error(error.message);
      return toDomain(data as unknown as PaymentChargeRow);
    },

    async update(id, changes) {
      if (isLocalPreviewEnabled()) {
        const index = previewCharges.findIndex((c) => c.id === id);
        if (index === -1) throw new Error(`Cobrança não encontrada: ${id}`);
        previewCharges[index] = { ...previewCharges[index], ...changes, updatedAt: new Date().toISOString() };
        return previewCharges[index];
      }
      // A atualização real (finalização da reserva e cancelamento conciliado)
      // ocorre apenas no servidor, após checkFinanceAction e conferência remota.
      // O banco recusa UPDATE direto por authenticated, inclusive admin.
      const writer = createSupabaseAdminClient();
      let query = writer.from(TABLE).update(toRow(changes)).eq("id", id);
      // Cancelamento vs recebimento concorrente: jamais rebaixar 'paid'
      // para 'cancelled', mesmo quando o Asaas respondeu ao DELETE antes
      // de um webhook confirmar o pagamento.
      if (changes.status === "cancelled") query = query.eq("status", "pending");
      // Reserva só aceita anexar a cobrança remota enquanto ainda não
      // vinculada. Um webhook/conciliador concorrente não perde o vínculo.
      if (changes.providerChargeId) query = query.is("provider_charge_id", null);
      const { data, error } = await query.select(COLUMNS).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        const { data: latest, error: readError } = await writer.from(TABLE)
          .select("status,provider_charge_id").eq("id", id).maybeSingle();
        if (readError) throw new Error(readError.message);
        if (latest?.status === "paid")
          throw new Error("Cobrança já paga durante a operação. Não é permitido cancelar nem substituir sua referência.");
        if (latest?.provider_charge_id && changes.providerChargeId)
          throw new Error("Cobrança já vinculada por outra conciliação. Atualize a tela.");
        throw new Error("Cobrança mudou durante a operação. Atualize a tela antes de continuar.");
      }
      return toDomain(data as unknown as PaymentChargeRow);
    },

    async confirmCharge(id, input: ConfirmChargeInput): Promise<ConfirmChargeResult> {
      if (isLocalPreviewEnabled()) {
        // Simulação local — nunca chama a RPC real em preview (regra
        // explícita da tarefa). Reproduz o MESMO contrato da RPC,
        // inclusive o excedente virando crédito: nunca cria um receipt
        // maior que o saldo atual do título (mutando diretamente os
        // arrays de preview de receivableRepository/clientCreditRepository
        // — mesmo princípio de estado compartilhado em memória usado por
        // todo o módulo em SYSTEM_LOCAL_PREVIEW=1).
        const index = previewCharges.findIndex((c) => c.id === id);
        if (index === -1) throw new Error(`Cobrança não encontrada: ${id}`);
        const existing = previewCharges[index];

        // IDEMPOTÊNCIA: a fonte de verdade é o STATUS, nunca receiptId
        // isolado — quando o saldo já era zero na confirmação original,
        // nenhum receipt foi criado (receiptId fica legitimamente
        // undefined) mas a cobrança já está "paid" com o excedente
        // inteiro em crédito. Mesmo critério da RPC real (ver
        // 20261027100500_confirm_payment_charge_idempotency_fix.sql).
        if (existing.status === "paid") {
          const existingCredit = PREVIEW_CLIENT_CREDITS.find((c) => c.originPaymentChargeId === id);
          return {
            charge: existing,
            receiptId: existing.receiptId,
            alreadyConfirmed: true,
            overpaymentAmount: existingCredit?.originalAmount ?? 0,
            creditId: existingCredit?.id,
          };
        }

        const receivable = PREVIEW_RECEIVABLES.find((r) => r.id === existing.receivableId);
        if (!receivable) throw new Error(`Título não encontrado: ${existing.receivableId}`);

        const balanceBefore = receivable.balance;
        const apply = Math.max(round2(Math.min(existing.amount, balanceBefore)), 0);
        const overpayment = round2(existing.amount - apply);

        let receiptId: string | undefined;
        if (apply > 0) {
          receiptId = `preview-pix-receipt-${Date.now()}`;
          PREVIEW_RECEIPTS.push({
            id: receiptId,
            receivableId: receivable.id,
            amount: apply,
            receivedAt: input.receivedAt,
            paymentMethod: "pix",
            recordedAt: new Date().toISOString(),
          });
          receivable.totalReceived = round2(receivable.totalReceived + apply);
          receivable.balance = round2(receivable.balance - apply);
        }

        let creditId: string | undefined;
        if (overpayment > 0) {
          creditId = `preview-credito-pix-${Date.now()}`;
          const credit: ClientCreditWithBalance = {
            id: creditId,
            clientId: existing.clientId,
            sourceType: receivable.sourceType,
            subscriptionId: receivable.subscriptionId,
            contractId: receivable.contractId,
            originReceivableId: receivable.id,
            originReceiptId: receiptId,
            originPaymentChargeId: id,
            originalAmount: overpayment,
            reason: `Excedente de cobrança Pix confirmada (preview): cobrança de ${existing.amount} sobre saldo de ${balanceBefore} no título ${receivable.reference}.`,
            createdAt: new Date().toISOString(),
            totalApplied: 0,
            balance: overpayment,
          };
          PREVIEW_CLIENT_CREDITS.push(credit);
        }

        receivable.status = receivable.balance <= 0 ? "paid" : receivable.balance < receivable.originalAmount ? "partially_paid" : "open";

        previewCharges[index] = {
          ...existing,
          status: "paid",
          paidAt: new Date().toISOString(),
          receiptId,
          updatedAt: new Date().toISOString(),
        };

        return { charge: previewCharges[index], receiptId, alreadyConfirmed: false, overpaymentAmount: overpayment, creditId };
      }

      const { data: rpcData, error: rpcError } = await client
        .rpc("confirm_payment_charge", {
          p_charge_id: id,
          p_received_at: input.receivedAt,
          p_received_by: input.receivedByProfileId ?? null,
        })
        .single();
      if (rpcError) throw new Error(rpcError.message);
      const result = rpcData as unknown as {
        receipt_id: string | null;
        already_confirmed: boolean;
        overpayment_amount: number;
        credit_id: string | null;
      };

      const { data, error } = await client.from(TABLE).select(COLUMNS).eq("id", id).single();
      if (error) throw new Error(error.message);
      return {
        charge: toDomain(data as unknown as PaymentChargeRow),
        receiptId: result.receipt_id ?? undefined,
        alreadyConfirmed: result.already_confirmed,
        overpaymentAmount: Number(result.overpayment_amount ?? 0),
        creditId: result.credit_id ?? undefined,
      };
    },
  };
}
