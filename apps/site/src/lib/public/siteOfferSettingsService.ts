import { getPublicSupabaseClient } from "./supabasePublicClient";

export interface PublicSiteOfferSettings {
  annualSubscriptionPrice: number | null;
  printBusinessCardPrice: number;
  printStandardPrice: number;
  printQuarterPrice: number;
  printHalfPrice: number;
  printFullPrice: number;

  ledSjs1x2Price: number;
  ledPraiaGrande1x2Price: number;
  ledPassoTorres1x2Price: number;
  ledSjs4x2Price: number;

  annualSubscriptionComboDiscount: number;
  printBusinessCardComboDiscount: number;
  printStandardComboDiscount: number;
  printQuarterComboDiscount: number;
  printHalfComboDiscount: number;
  printFullComboDiscount: number;

  ledSjs1x2ComboDiscount: number;
  ledPraiaGrande1x2ComboDiscount: number;
  ledPassoTorres1x2ComboDiscount: number;
  ledSjs4x2ComboDiscount: number;
}

export const DEFAULT_SITE_OFFER_SETTINGS: PublicSiteOfferSettings = {
  annualSubscriptionPrice: 130,
  printBusinessCardPrice: 130,
  printStandardPrice: 180,
  printQuarterPrice: 350,
  printHalfPrice: 700,
  printFullPrice: 1200,

  ledSjs1x2Price: 0,
  ledPraiaGrande1x2Price: 0,
  ledPassoTorres1x2Price: 0,
  ledSjs4x2Price: 0,

  annualSubscriptionComboDiscount: 50,
  printBusinessCardComboDiscount: 50,
  printStandardComboDiscount: 50,
  printQuarterComboDiscount: 50,
  printHalfComboDiscount: 50,
  printFullComboDiscount: 50,

  ledSjs1x2ComboDiscount: 50,
  ledPraiaGrande1x2ComboDiscount: 50,
  ledPassoTorres1x2ComboDiscount: 50,
  ledSjs4x2ComboDiscount: 50,
};

interface Row {
  annual_subscription_price: number | string | null;
  print_business_card_price: number | string;
  print_standard_price: number | string;
  print_quarter_price: number | string;
  print_half_price: number | string;
  print_full_price: number | string;

  led_sjs_1x2_price: number | string;
  led_praia_grande_1x2_price: number | string;
  led_passo_torres_1x2_price: number | string;
  led_sjs_4x2_price: number | string;

  annual_subscription_combo_discount: number | string;
  print_business_card_combo_discount: number | string;
  print_standard_combo_discount: number | string;
  print_quarter_combo_discount: number | string;
  print_half_combo_discount: number | string;
  print_full_combo_discount: number | string;

  led_sjs_1x2_combo_discount: number | string;
  led_praia_grande_1x2_combo_discount: number | string;
  led_passo_torres_1x2_combo_discount: number | string;
  led_sjs_4x2_combo_discount: number | string;
}

function numberValue(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export async function getPublicSiteOfferSettings(): Promise<PublicSiteOfferSettings> {
  try {
    const client = getPublicSupabaseClient();
    const { data, error } = await client
      .from("site_offer_settings")
      .select(
        "annual_subscription_price, print_business_card_price, print_standard_price, print_quarter_price, print_half_price, print_full_price, led_sjs_1x2_price, led_praia_grande_1x2_price, led_passo_torres_1x2_price, led_sjs_4x2_price, annual_subscription_combo_discount, print_business_card_combo_discount, print_standard_combo_discount, print_quarter_combo_discount, print_half_combo_discount, print_full_combo_discount, led_sjs_1x2_combo_discount, led_praia_grande_1x2_combo_discount, led_passo_torres_1x2_combo_discount, led_sjs_4x2_combo_discount",
      )
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) return DEFAULT_SITE_OFFER_SETTINGS;
    const row = data as Row;

    return {
      annualSubscriptionPrice: row.annual_subscription_price === null ? null : numberValue(row.annual_subscription_price),
      printBusinessCardPrice: numberValue(row.print_business_card_price),
      printStandardPrice: numberValue(row.print_standard_price),
      printQuarterPrice: numberValue(row.print_quarter_price),
      printHalfPrice: numberValue(row.print_half_price),
      printFullPrice: numberValue(row.print_full_price),

      ledSjs1x2Price: numberValue(row.led_sjs_1x2_price),
      ledPraiaGrande1x2Price: numberValue(row.led_praia_grande_1x2_price),
      ledPassoTorres1x2Price: numberValue(row.led_passo_torres_1x2_price),
      ledSjs4x2Price: numberValue(row.led_sjs_4x2_price),

      annualSubscriptionComboDiscount: numberValue(row.annual_subscription_combo_discount),
      printBusinessCardComboDiscount: numberValue(row.print_business_card_combo_discount),
      printStandardComboDiscount: numberValue(row.print_standard_combo_discount),
      printQuarterComboDiscount: numberValue(row.print_quarter_combo_discount),
      printHalfComboDiscount: numberValue(row.print_half_combo_discount),
      printFullComboDiscount: numberValue(row.print_full_combo_discount),

      ledSjs1x2ComboDiscount: numberValue(row.led_sjs_1x2_combo_discount),
      ledPraiaGrande1x2ComboDiscount: numberValue(row.led_praia_grande_1x2_combo_discount),
      ledPassoTorres1x2ComboDiscount: numberValue(row.led_passo_torres_1x2_combo_discount),
      ledSjs4x2ComboDiscount: numberValue(row.led_sjs_4x2_combo_discount),
    };
  } catch {
    return DEFAULT_SITE_OFFER_SETTINGS;
  }
}

/**
 * Controla se a página pública `/assine` (que também reúne Anuncie) fica
 * visível no site — pedido explícito do usuário em 18/10/2026. Consulta
 * própria e enxuta (nunca a linha inteira de preços) porque isto é lido no
 * cabeçalho de TODA página pública, não só em `/assine`.
 *
 * Falha-fechado de propósito: qualquer erro, ausência de linha ou valor
 * inesperado retorna `false` — a configuração nunca "liga sozinha" por
 * causa de uma falha de leitura.
 */
export async function getSiteAssineEnabled(): Promise<boolean> {
  try {
    const client = getPublicSupabaseClient();
    const { data, error } = await client
      .from("site_offer_settings")
      .select("assine_enabled")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { assine_enabled: boolean | null }).assine_enabled === true;
  } catch {
    return false;
  }
}
