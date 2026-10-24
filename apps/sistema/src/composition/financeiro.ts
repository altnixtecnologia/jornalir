import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BillingMessageService,
  ClientCreditService,
  ContractService,
  ContractTemplateService,
  PaymentChargeService,
  ReceivableService,
  createPixProviderPreview,
  createPixProviderUnavailable,
  createWhatsappSenderPreview,
  createWhatsappSenderUnavailable,
} from "@ir/core";
import { createReceivableRepositorySupabase } from "../providers/supabase/receivableRepository.supabase";
import { createContractRepositorySupabase } from "../providers/supabase/contractRepository.supabase";
import { createContractTemplateRepositorySupabase } from "../providers/supabase/contractTemplateRepository.supabase";
import { createClientCreditRepositorySupabase } from "../providers/supabase/clientCreditRepository.supabase";
import { createPaymentChargeRepositorySupabase } from "../providers/supabase/paymentChargeRepository.supabase";
import { createBillingMessageLogRepositorySupabase } from "../providers/supabase/billingMessageLogRepository.supabase";
import { isLocalPreviewEnabled } from "../lib/auth/localPreview";
import { createAsaasPixProvider } from "../lib/financeiro/asaasPixProvider";

// Ponto de composição do módulo Financeiro — fábrica, nunca singleton de
// módulo (mesmo princípio de composition/assinaturas.ts e composition/clientes.ts).
export function getReceivableService(client: SupabaseClient): ReceivableService {
  return new ReceivableService(createReceivableRepositorySupabase(client), createClientCreditRepositorySupabase(client));
}

export function getContractService(client: SupabaseClient): ContractService {
  return new ContractService(createContractRepositorySupabase(client));
}

/** Modelos de contrato e geração automática de PDF (Item 5, Lote 3). */
export function getContractTemplateService(client: SupabaseClient): ContractTemplateService {
  return new ContractTemplateService(createContractTemplateRepositorySupabase(client));
}

export function getClientCreditService(client: SupabaseClient): ClientCreditService {
  return new ClientCreditService(createClientCreditRepositorySupabase(client));
}

/**
 * Preview utiliza adapter de demonstração; fora dele o provedor é
 * Asaas, com habilitação/credenciais conferidas no servidor. Nunca
 * criar cobrança remota a partir de ambiente sem permissão e configuração.
 */
export function getPaymentChargeService(client: SupabaseClient): PaymentChargeService {
  const provider = isLocalPreviewEnabled() ? createPixProviderPreview() : createAsaasPixProvider(client);
  return new PaymentChargeService(createPaymentChargeRepositorySupabase(client), provider);
}

/** Mesmo princípio de getPaymentChargeService: preview simula, fora do preview recusa honestamente até um provedor WhatsApp ser configurado. */
export function getBillingMessageService(client: SupabaseClient): BillingMessageService {
  const sender = isLocalPreviewEnabled() ? createWhatsappSenderPreview() : createWhatsappSenderUnavailable();
  return new BillingMessageService(createBillingMessageLogRepositorySupabase(client), sender);
}
