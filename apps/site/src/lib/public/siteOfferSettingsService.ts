import { getPublicSupabaseClient } from "./supabasePublicClient";

export interface PublicSiteOfferSettings {
  annualSubscriptionPrice: number | null;
  printBusinessCardPrice: number;
  printStandardPrice: number;
  printQuarterPrice: number;
  printHalfPrice: number;
  printFullPrice: number;
  ledThreeCitiesPrice: number;
  comboBusinessCardLedPrice: number;
  comboStandardLedPrice: number;
  comboQuarterLedPrice: number;
  comboHalfLedPrice: number;
  comboFullLedPrice: number;
}

export const DEFAULT_SITE_OFFER_SETTINGS: PublicSiteOfferSettings = {
  annualSubscriptionPrice: null,
  printBusinessCardPrice: 130,
  printStandardPrice: 180,
  printQuarterPrice: 350,
  printHalfPrice: 700,
  printFullPrice: 1200,
  ledThreeCitiesPrice: 800,
  comboBusinessCardLedPrice: 900,
  comboStandardLedPrice: 950,
  comboQuarterLedPrice: 1100,
  comboHalfLedPrice: 1450,
  comboFullLedPrice: 1950,
};

interface Row {
  annual_subscription_price: number | string | null;
  print_business_card_price: number | string;
  print_standard_price: number | string;
  print_quarter_price: number | string;
  print_half_price: number | string;
  print_full_price: number | string;
  led_three_cities_price: number | string;
  combo_business_card_led_price: number | string;
  combo_standard_led_price: number | string;
  combo_quarter_led_price: number | string;
  combo_half_led_price: number | string;
  combo_full_led_price: number | string;
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
        "annual_subscription_price, print_business_card_price, print_standard_price, print_quarter_price, print_half_price, print_full_price, led_three_cities_price, combo_business_card_led_price, combo_standard_led_price, combo_quarter_led_price, combo_half_led_price, combo_full_led_price",
      )
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) return DEFAULT_SITE_OFFER_SETTINGS;

    const row = data as Row;
    return {
      annualSubscriptionPrice:
        row.annual_subscription_price === null ? null : numberValue(row.annual_subscription_price),
      printBusinessCardPrice: numberValue(row.print_business_card_price),
      printStandardPrice: numberValue(row.print_standard_price),
      printQuarterPrice: numberValue(row.print_quarter_price),
      printHalfPrice: numberValue(row.print_half_price),
      printFullPrice: numberValue(row.print_full_price),
      ledThreeCitiesPrice: numberValue(row.led_three_cities_price),
      comboBusinessCardLedPrice: numberValue(row.combo_business_card_led_price),
      comboStandardLedPrice: numberValue(row.combo_standard_led_price),
      comboQuarterLedPrice: numberValue(row.combo_quarter_led_price),
      comboHalfLedPrice: numberValue(row.combo_half_led_price),
      comboFullLedPrice: numberValue(row.combo_full_led_price),
    };
  } catch {
    return DEFAULT_SITE_OFFER_SETTINGS;
  }
}
