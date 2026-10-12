import { getPublicSupabaseClient } from "./supabasePublicClient";

export interface PublicSiteOfferSettings {
  annualSubscriptionPrice: number | null;
  printBusinessCardPrice: number;
  printStandardPrice: number;
  printQuarterPrice: number;
  printHalfPrice: number;
  printFullPrice: number;
  ledThreeCitiesPrice: number;

  annualSubscriptionComboDiscount: number;
  printBusinessCardComboDiscount: number;
  printStandardComboDiscount: number;
  printQuarterComboDiscount: number;
  printHalfComboDiscount: number;
  printFullComboDiscount: number;
  ledThreeCitiesComboDiscount: number;
}

export const DEFAULT_SITE_OFFER_SETTINGS: PublicSiteOfferSettings = {
  annualSubscriptionPrice: 130,
  printBusinessCardPrice: 130,
  printStandardPrice: 180,
  printQuarterPrice: 350,
  printHalfPrice: 700,
  printFullPrice: 1200,
  ledThreeCitiesPrice: 800,

  annualSubscriptionComboDiscount: 50,
  printBusinessCardComboDiscount: 50,
  printStandardComboDiscount: 50,
  printQuarterComboDiscount: 50,
  printHalfComboDiscount: 50,
  printFullComboDiscount: 50,
  ledThreeCitiesComboDiscount: 50,
};

interface Row {
  annual_subscription_price: number | string | null;
  print_business_card_price: number | string;
  print_standard_price: number | string;
  print_quarter_price: number | string;
  print_half_price: number | string;
  print_full_price: number | string;
  led_three_cities_price: number | string;

  annual_subscription_combo_discount: number | string;
  print_business_card_combo_discount: number | string;
  print_standard_combo_discount: number | string;
  print_quarter_combo_discount: number | string;
  print_half_combo_discount: number | string;
  print_full_combo_discount: number | string;
  led_three_cities_combo_discount: number | string;
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
        "annual_subscription_price, print_business_card_price, print_standard_price, print_quarter_price, print_half_price, print_full_price, led_three_cities_price, annual_subscription_combo_discount, print_business_card_combo_discount, print_standard_combo_discount, print_quarter_combo_discount, print_half_combo_discount, print_full_combo_discount, led_three_cities_combo_discount",
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

      annualSubscriptionComboDiscount: numberValue(row.annual_subscription_combo_discount),
      printBusinessCardComboDiscount: numberValue(row.print_business_card_combo_discount),
      printStandardComboDiscount: numberValue(row.print_standard_combo_discount),
      printQuarterComboDiscount: numberValue(row.print_quarter_combo_discount),
      printHalfComboDiscount: numberValue(row.print_half_combo_discount),
      printFullComboDiscount: numberValue(row.print_full_combo_discount),
      ledThreeCitiesComboDiscount: numberValue(row.led_three_cities_combo_discount),
    };
  } catch {
    return DEFAULT_SITE_OFFER_SETTINGS;
  }
}
