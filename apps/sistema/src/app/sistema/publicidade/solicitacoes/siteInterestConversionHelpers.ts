import type { CommercialCondition } from "@ir/types";

// Funções puras extraídas de actions.ts (31/10/2026) só pra serem
// testáveis — um arquivo "use server" só pode exportar async functions,
// então essa lógica de parsing/validação (sem I/O) precisa viver fora
// dele pra ganhar teste unitário real.

export type SiteInterestPaymentPreference = "pix" | "boleto" | "credit_card" | "cash" | "to_define" | null;

export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function todayInBrazil(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addYearsIso(iso: string, years: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

export interface AdvertisingSelection {
  id: string;
  label: string;
  price: number;
  type: "print_ad" | "digital_ad";
}

export function advertisingSelections(selections: unknown): AdvertisingSelection[] {
  if (!Array.isArray(selections)) return [];
  const result: AdvertisingSelection[] = [];

  for (const selection of selections) {
    if (!selection || typeof selection !== "object") continue;
    const item = selection as Record<string, unknown>;
    if (item.type !== "print_ad" && item.type !== "digital_ad") continue;

    const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : String(item.id ?? "Publicidade");
    let price = 0;
    for (const key of ["finalPrice", "individualPrice", "price"]) {
      const value = item[key];
      if (value === null || value === undefined || value === "") continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        price = parsed;
        break;
      }
    }

    result.push({
      id: typeof item.id === "string" ? item.id : label,
      label,
      price,
      type: item.type,
    });
  }

  return result;
}

export function subscriptionSelectionAmount(selections: unknown): number | null {
  if (!Array.isArray(selections)) return null;
  for (const selection of selections) {
    if (!selection || typeof selection !== "object") continue;
    const item = selection as Record<string, unknown>;
    const isSubscription = item.type === "subscription" || item.kind === "subscription" || item.id === "annual-newspaper";
    if (!isSubscription) continue;
    for (const key of ["finalPrice", "individualPrice", "price"]) {
      const value = item[key];
      if (value === null || value === undefined || value === "") continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return null;
}

export function commercialConditionFromPayment(payment: SiteInterestPaymentPreference): CommercialCondition {
  if (payment === "pix" || payment === "cash") return "cash";
  if (payment === "boleto" || payment === "credit_card") return "installments";
  return "other";
}

/**
 * Soma dos itens individuais (publicidade + assinatura, quando mista) —
 * Bloco 2, item 3 (01/11/2026). Serve pra conferir se `approved_total`
 * (um único valor pro pedido inteiro, definido na revisão) ainda bate
 * com a soma real dos itens antes de converter; nunca usado pra ratear
 * desconto automaticamente.
 */
export function advertisingItemsTotal(items: Pick<AdvertisingSelection, "price">[], subscriptionAmount: number | null): number {
  return items.reduce((sum, item) => sum + item.price, 0) + (subscriptionAmount ?? 0);
}

/**
 * true quando `approvedTotal` (se definido) diverge da soma real dos
 * itens além de 1 centavo de tolerância — sinal de que a revisão
 * aprovou um valor diferente da soma simples (ex.: desconto de combo)
 * que a conversão não consegue ratear automaticamente.
 */
export function approvedTotalDivergesFromItems(approvedTotal: number | null, itemsTotal: number): boolean {
  return approvedTotal !== null && Math.abs(approvedTotal - itemsTotal) > 0.01;
}
