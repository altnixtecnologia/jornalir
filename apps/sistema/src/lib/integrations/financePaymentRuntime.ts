import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PaymentChargeAlreadyPendingError } from "@ir/core";
import { getPaymentChargeService } from "../../composition/financeiro";
import { listReportExcludedReceivableIds } from "../../providers/supabase/receivableReportExclusion.supabase";
import {
  executeFinancePayment, MAX_CARD_INSTALLMENTS,
  type FinancePaymentMethods, type FinancePaymentOutcome, type FinancePaymentRequest,
} from "./altnixFinancePayment";
import { allowedReturnOrigins, buildPortalReturnUrl } from "../financeiro/cardPaymentUrls";

/**
 * Execução do pagamento a partir do banco, compartilhada pela ponte do Informativo e pela página pública do
 * Jornal: formas disponíveis (configuração central + chave de ativação), titularidade do título, exclusão de
 * teste e a decisão única de `executeFinancePayment`. Nada vem do navegador além do pedido já validado.
 */
export async function loadPaymentMethods(db: SupabaseClient): Promise<FinancePaymentMethods> {
  const { data: settings } = await db.from("billing_provider_settings")
    .select("enabled, allow_pix, allow_credit_card, credit_card_max_installments, credit_card_min_installment_amount").eq("id", 1).maybeSingle();
  return {
    pix: { enabled: Boolean(settings?.enabled && settings?.allow_pix) },
    card: {
      enabled: process.env.JORNALIR_FINANCE_CARD_ENABLED === "true" && Boolean(settings?.enabled && settings?.allow_credit_card),
      maxInstallments: Math.min(Number(settings?.credit_card_max_installments ?? 1) || 1, MAX_CARD_INSTALLMENTS),
      minInstallmentAmount: Number(settings?.credit_card_min_installment_amount ?? 5) || 5,
    },
  };
}

/** Retorno do cartão ao portal: só com o callback habilitado (domínio cadastrado no Asaas) e partes válidas. */
export function cardReturnUrlFor(command: FinancePaymentRequest, override?: string | null): string | null {
  if (override) return override;
  if (command.action !== "card" || process.env.ASAAS_CARD_CALLBACK_ENABLED !== "true") return null;
  return buildPortalReturnUrl({
    origins: allowedReturnOrigins(process.env.JORNALIR_CARD_RETURN_ORIGINS),
    portalCode: command.returnPortalCode, ref: command.returnRef,
  });
}

export async function runFinancePayment(db: SupabaseClient, command: FinancePaymentRequest, options: { cardSuccessUrl?: string | null } = {}): Promise<FinancePaymentOutcome> {
  // Titularidade: o título precisa pertencer ao cliente canônico informado.
  const { data: row, error } = await db.from("receivables_with_balance")
    .select("id,client_id,status,balance,source_type,commercial_sale_id,internal_reference")
    .eq("id", command.receivableId).eq("client_id", command.canonicalClientId).maybeSingle();
  if (error) return { status: 503, body: { error: "Consulta temporariamente indisponível.", code: "unavailable" } };
  const [excluded, methods] = await Promise.all([
    row ? listReportExcludedReceivableIds(db) : Promise.resolve([] as string[]),
    loadPaymentMethods(db),
  ]);
  return executeFinancePayment(command, {
    methods,
    cardSuccessUrl: cardReturnUrlFor(command, options.cardSuccessUrl),
    receivable: row ? {
      clientId: String(row.client_id), status: String(row.status), balance: Number(row.balance),
      sourceType: (row.source_type as string | null) ?? null,
      commercialSaleId: (row.commercial_sale_id as string | null) ?? null,
      excludedFromReports: excluded.includes(command.receivableId),
      reference: (row.internal_reference as string | null) ?? null,
    } : null,
    charges: getPaymentChargeService(db),
    isAlreadyPendingError: (e) => e instanceof PaymentChargeAlreadyPendingError,
    now: () => Date.now(),
  });
}
