import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PixProviderUnavailableError,
  type CreatePixChargeRequest,
  type PixChargeProviderResult,
  type PixProvider,
} from "@ir/core";
import { getAsaasApiKey } from "./asaasEnv";

interface BillingSettingsRow {
  environment: "sandbox" | "production";
  enabled: boolean;
  allow_pix: boolean;
  default_due_days: number;
}

interface ClientRow {
  id: string;
  kind: "individual" | "company";
  full_name: string | null;
  company_name: string | null;
  trade_name: string | null;
  cpf: string | null;
  cnpj: string | null;
  whatsapp: string | null;
  phone_primary: string | null;
  email: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  asaas_customer_id: string | null;
  asaas_customer_environment: "sandbox" | "production" | null;
}

interface AsaasPayment {
  id: string;
  status: string;
  dueDate?: string;
  value?: number;
  billingType?: string;
}
interface AsaasPaymentList { data?: AsaasPayment[]; }
interface AsaasCustomer { id: string; }
interface AsaasCustomerList { data?: AsaasCustomer[]; }
export interface AsaasPixQrCode {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
}

function onlyDigits(value?: string | null): string | undefined {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits || undefined;
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function mapStatus(status: string): PixChargeProviderResult["status"] {
  const normalized = status.toUpperCase();
  if (normalized === "RECEIVED" || normalized === "RECEIVED_IN_CASH") return "paid";
  if (normalized === "DELETED" || normalized === "REFUNDED" || normalized === "REFUND_REQUESTED") return "cancelled";
  if (normalized === "PENDING" || normalized === "OVERDUE" || normalized === "CONFIRMED") return "pending";
  return "failed";
}

function baseUrl(environment: "sandbox" | "production"): string {
  return environment === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
}

async function loadSettings(client: SupabaseClient): Promise<BillingSettingsRow> {
  const { data, error } = await client
    .from("billing_provider_settings")
    .select("environment, enabled, allow_pix, default_due_days")
    .eq("id", 1)
    .single();

  if (error || !data) throw new PixProviderUnavailableError();
  const settings = data as BillingSettingsRow;
  if (!settings.enabled || !settings.allow_pix || !getAsaasApiKey(settings.environment)) throw new PixProviderUnavailableError();
  return settings;
}

async function asaasFetch<T>(settings: BillingSettingsRow, path: string, init?: RequestInit): Promise<T> {
  const key = getAsaasApiKey(settings.environment);
  if (!key) throw new PixProviderUnavailableError();

  const response = await fetch(`${baseUrl(settings.environment)}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "InformativoRegional/1.0",
      access_token: key,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Asaas retornou ${response.status}: ${body.slice(0, 500)}`);
  }
  return (await response.json()) as T;
}

async function findExistingActivePayment(
  settings: BillingSettingsRow,
  externalReference: string,
): Promise<AsaasPayment | null> {
  const result = await asaasFetch<AsaasPaymentList>(
    settings,
    `/payments?externalReference=${encodeURIComponent(externalReference)}&limit=10`,
    { method: "GET" },
  );

  const active = (result.data ?? []).filter((payment) => {
    const status = payment.status.toUpperCase();
    return status !== "DELETED" && status !== "REFUNDED" && status !== "REFUND_REQUESTED";
  });

  if (active.length > 1) {
    throw new Error(
      "Há mais de uma cobrança ativa no Asaas para este título. Faça a conciliação antes de gerar outra cobrança.",
    );
  }
  return active[0] ?? null;
}

async function ensureAsaasCustomer(client: SupabaseClient, settings: BillingSettingsRow, clientId: string): Promise<string> {
  const { data, error } = await client
    .from("clients")
    .select("id, kind, full_name, company_name, trade_name, cpf, cnpj, whatsapp, phone_primary, email, address_zip, address_street, address_number, address_complement, address_neighborhood, asaas_customer_id, asaas_customer_environment")
    .eq("id", clientId)
    .single();

  if (error || !data) throw new Error("Cliente não encontrado para gerar a cobrança.");
  const row = data as unknown as ClientRow;

  if (row.asaas_customer_id && row.asaas_customer_environment === settings.environment) {
    return row.asaas_customer_id;
  }

  const document = onlyDigits(row.kind === "company" ? row.cnpj : row.cpf);
  if (!document) throw new Error("O cadastro precisa de CPF/CNPJ antes de gerar cobrança pelo Asaas.");
  const name = row.kind === "company" ? row.trade_name || row.company_name : row.full_name;
  if (!name) throw new Error("O cadastro precisa de nome/razão social antes de gerar cobrança.");

  // Procura primeiro no AMBIENTE atual usando a referência interna. Assim,
  // alternar sandbox -> produção (ou voltar) nunca reutiliza o customer_id
  // do outro ambiente e também não cria clientes duplicados em tentativas
  // repetidas depois de timeout.
  const existing = await asaasFetch<AsaasCustomerList>(
    settings,
    `/customers?externalReference=${encodeURIComponent(row.id)}&limit=10`,
    { method: "GET" },
  );
  const matches = existing.data ?? [];
  if (matches.length > 1) {
    throw new Error("Há mais de um cliente no Asaas com a mesma referência interna. Faça a conciliação antes de gerar cobrança.");
  }

  let customerId = matches[0]?.id;
  if (!customerId) {
    const created = await asaasFetch<{ id: string }>(settings, "/customers", {
      method: "POST",
      body: JSON.stringify({
        name,
        cpfCnpj: document,
        email: row.email || undefined,
        mobilePhone: onlyDigits(row.whatsapp || row.phone_primary),
        address: row.address_street || undefined,
        addressNumber: row.address_number || undefined,
        complement: row.address_complement || undefined,
        province: row.address_neighborhood || undefined,
        postalCode: row.address_zip || undefined,
        externalReference: row.id,
        notificationDisabled: true,
      }),
    });
    customerId = created.id;
  }

  const { error: updateError } = await client
    .from("clients")
    .update({
      asaas_customer_id: customerId,
      asaas_customer_environment: settings.environment,
    })
    .eq("id", clientId);
  if (updateError) throw new Error(updateError.message);
  return customerId;
}

export async function getAsaasPixQrCodeData(
  client: SupabaseClient,
  providerChargeId: string,
): Promise<AsaasPixQrCode> {
  const settings = await loadSettings(client);
  return asaasFetch<AsaasPixQrCode>(
    settings,
    `/payments/${encodeURIComponent(providerChargeId)}/pixQrCode`,
    { method: "GET" },
  );
}

async function validatePixPayload(
  settings: BillingSettingsRow,
  payload: string,
): Promise<void> {
  if (!payload.trim()) {
    throw new Error("O Asaas não retornou um Pix Copia e Cola válido.");
  }

  await asaasFetch<Record<string, unknown>>(settings, "/pix/qrCodes/decode", {
    method: "POST",
    body: JSON.stringify({ payload }),
  });
}

export function createAsaasPixProvider(client: SupabaseClient): PixProvider {
  return {
    async createCharge(request: CreatePixChargeRequest): Promise<PixChargeProviderResult> {
      const settings = await loadSettings(client);
      const externalReference = `receivable:${request.receivableId}`;
      const recovered = await findExistingActivePayment(settings, externalReference);

      if (recovered) {
        if (recovered.billingType && recovered.billingType.toUpperCase() !== "PIX") {
          throw new Error("A cobrança existente no Asaas para este título não é Pix. Faça a conciliação antes de continuar.");
        }
        if (typeof recovered.value === "number" && Math.abs(recovered.value - request.amount) > 0.005) {
          throw new Error(
            `Já existe uma cobrança Asaas para este título com valor diferente (R$ ${recovered.value.toFixed(2)}). Faça a conciliação antes de gerar outra.`,
          );
        }

        let qr: AsaasPixQrCode = {};
        try {
          qr = await asaasFetch<AsaasPixQrCode>(settings, `/payments/${recovered.id}/pixQrCode`, { method: "GET" });
        } catch {
          // Cobrança já paga pode não disponibilizar mais o QR Code.
        }
        if (qr.payload) await validatePixPayload(settings, qr.payload);
        return {
          provider: "asaas",
          providerChargeId: recovered.id,
          pixCopyPaste: qr.payload ?? "",
          expiresAt: recovered.dueDate ? `${recovered.dueDate}T23:59:59-03:00` : undefined,
          status: mapStatus(recovered.status),
        };
      }

      const customer = await ensureAsaasCustomer(client, settings, request.clientId);
      const dueDate = request.expiresAt?.slice(0, 10) || addDaysIso(settings.default_due_days);

      const payment = await asaasFetch<AsaasPayment>(settings, "/payments", {
        method: "POST",
        body: JSON.stringify({
          customer,
          billingType: "PIX",
          value: request.amount,
          dueDate,
          description: request.description?.slice(0, 500),
          externalReference,
        }),
      });

      const qr = await asaasFetch<AsaasPixQrCode>(settings, `/payments/${payment.id}/pixQrCode`, { method: "GET" });
      await validatePixPayload(settings, qr.payload ?? "");

      return {
        provider: "asaas",
        providerChargeId: payment.id,
        pixCopyPaste: qr.payload ?? "",
        expiresAt: `${dueDate}T23:59:59-03:00`,
        status: mapStatus(payment.status),
      };
    },

    async getCharge(providerChargeId: string): Promise<PixChargeProviderResult> {
      const settings = await loadSettings(client);
      const payment = await asaasFetch<AsaasPayment>(settings, `/payments/${providerChargeId}`, { method: "GET" });
      let qr: AsaasPixQrCode = {};
      try {
        qr = await asaasFetch<AsaasPixQrCode>(settings, `/payments/${providerChargeId}/pixQrCode`, { method: "GET" });
      } catch {
        // Cobranças liquidadas/canceladas podem não ter QR disponível.
      }
      return {
        provider: "asaas",
        providerChargeId,
        pixCopyPaste: qr.payload ?? "",
        expiresAt: payment.dueDate ? `${payment.dueDate}T23:59:59-03:00` : undefined,
        status: mapStatus(payment.status),
      };
    },

    async cancelCharge(providerChargeId: string): Promise<void> {
      const settings = await loadSettings(client);
      await asaasFetch<Record<string, unknown>>(settings, `/payments/${providerChargeId}`, { method: "DELETE" });
    },
  };
}
