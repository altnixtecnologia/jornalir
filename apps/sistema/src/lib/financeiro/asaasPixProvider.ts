import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PixProviderUnavailableError,
  type CreatePixChargeRequest,
  type PixChargeProviderResult,
  type PixProvider,
} from "@ir/core";

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
}

interface AsaasPayment { id: string; status: string; dueDate?: string; }
interface AsaasPixQrCode { payload?: string; expirationDate?: string; }

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

function keyForEnvironment(environment: "sandbox" | "production"): string | undefined {
  return environment === "sandbox" ? process.env.ASAAS_API_KEY_SANDBOX : process.env.ASAAS_API_KEY_PRODUCTION;
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
  if (!settings.enabled || !settings.allow_pix || !keyForEnvironment(settings.environment)) throw new PixProviderUnavailableError();
  return settings;
}

async function asaasFetch<T>(settings: BillingSettingsRow, path: string, init?: RequestInit): Promise<T> {
  const key = keyForEnvironment(settings.environment);
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

async function ensureAsaasCustomer(client: SupabaseClient, settings: BillingSettingsRow, clientId: string): Promise<string> {
  const { data, error } = await client
    .from("clients")
    .select("id, kind, full_name, company_name, trade_name, cpf, cnpj, whatsapp, phone_primary, email, address_zip, address_street, address_number, address_complement, address_neighborhood, asaas_customer_id")
    .eq("id", clientId)
    .single();

  if (error || !data) throw new Error("Cliente não encontrado para gerar a cobrança.");
  const row = data as ClientRow;
  if (row.asaas_customer_id) return row.asaas_customer_id;

  const document = onlyDigits(row.kind === "company" ? row.cnpj : row.cpf);
  if (!document) throw new Error("O cadastro precisa de CPF/CNPJ antes de gerar cobrança pelo Asaas.");
  const name = row.kind === "company" ? row.trade_name || row.company_name : row.full_name;
  if (!name) throw new Error("O cadastro precisa de nome/razão social antes de gerar cobrança.");

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

  const { error: updateError } = await client.from("clients").update({ asaas_customer_id: created.id }).eq("id", clientId);
  if (updateError) throw new Error(updateError.message);
  return created.id;
}

export function createAsaasPixProvider(client: SupabaseClient): PixProvider {
  return {
    async createCharge(request: CreatePixChargeRequest): Promise<PixChargeProviderResult> {
      const settings = await loadSettings(client);
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
          externalReference: `receivable:${request.receivableId}`,
        }),
      });

      const qr = await asaasFetch<AsaasPixQrCode>(settings, `/payments/${payment.id}/pixQrCode`, { method: "GET" });

      return {
        provider: "asaas",
        providerChargeId: payment.id,
        pixCopyPaste: qr.payload ?? "",
        expiresAt: qr.expirationDate ?? `${dueDate}T23:59:59`,
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
        expiresAt: qr.expirationDate,
        status: mapStatus(payment.status),
      };
    },

    async cancelCharge(providerChargeId: string): Promise<void> {
      const settings = await loadSettings(client);
      await asaasFetch<Record<string, unknown>>(settings, `/payments/${providerChargeId}`, { method: "DELETE" });
    },
  };
}
