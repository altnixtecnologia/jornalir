import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import {
  SiteOfferSettingsPanel,
  type SiteOfferSettingsValues,
} from "../../../../features/configuracoes/SiteOfferSettingsPanel";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SiteOfferSettingsPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data, error } = await client
    .from("site_offer_settings")
    .select(
      "annual_subscription_price, annual_subscription_combo_discount, print_business_card_price, print_business_card_combo_discount, print_standard_price, print_standard_combo_discount, print_quarter_price, print_quarter_combo_discount, print_half_price, print_half_combo_discount, print_full_price, print_full_combo_discount, led_three_cities_price, led_three_cities_combo_discount",
    )
    .eq("id", 1)
    .single();

  if (error) throw new Error(error.message);

  const values: SiteOfferSettingsValues = {
    annualSubscriptionPrice:
      data.annual_subscription_price === null ? null : Number(data.annual_subscription_price),
    annualSubscriptionComboDiscount: Number(data.annual_subscription_combo_discount),

    printBusinessCardPrice: Number(data.print_business_card_price),
    printBusinessCardComboDiscount: Number(data.print_business_card_combo_discount),

    printStandardPrice: Number(data.print_standard_price),
    printStandardComboDiscount: Number(data.print_standard_combo_discount),

    printQuarterPrice: Number(data.print_quarter_price),
    printQuarterComboDiscount: Number(data.print_quarter_combo_discount),

    printHalfPrice: Number(data.print_half_price),
    printHalfComboDiscount: Number(data.print_half_combo_discount),

    printFullPrice: Number(data.print_full_price),
    printFullComboDiscount: Number(data.print_full_combo_discount),

    ledThreeCitiesPrice: Number(data.led_three_cities_price),
    ledThreeCitiesComboDiscount: Number(data.led_three_cities_combo_discount),
  };

  return (
    <>
      <ModuleHeader
        eyebrow="CONFIGURAÇÕES / ASSINE"
        title="Valores e descontos da página Assine"
        description="Defina o valor de cada produto e o desconto aplicado nele quando o cliente colocar 2 ou mais produtos no carrinho."
      />
      <SiteOfferSettingsPanel values={values} />
    </>
  );
}
