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
      "annual_subscription_price, print_business_card_price, print_standard_price, print_quarter_price, print_half_price, print_full_price, led_three_cities_price, combo_business_card_led_price, combo_standard_led_price, combo_quarter_led_price, combo_half_led_price, combo_full_led_price",
    )
    .eq("id", 1)
    .single();

  if (error) throw new Error(error.message);

  const values: SiteOfferSettingsValues = {
    annualSubscriptionPrice:
      data.annual_subscription_price === null ? null : Number(data.annual_subscription_price),
    printBusinessCardPrice: Number(data.print_business_card_price),
    printStandardPrice: Number(data.print_standard_price),
    printQuarterPrice: Number(data.print_quarter_price),
    printHalfPrice: Number(data.print_half_price),
    printFullPrice: Number(data.print_full_price),
    ledThreeCitiesPrice: Number(data.led_three_cities_price),
    comboBusinessCardLedPrice: Number(data.combo_business_card_led_price),
    comboStandardLedPrice: Number(data.combo_standard_led_price),
    comboQuarterLedPrice: Number(data.combo_quarter_led_price),
    comboHalfLedPrice: Number(data.combo_half_led_price),
    comboFullLedPrice: Number(data.combo_full_led_price),
  };

  return (
    <>
      <ModuleHeader
        eyebrow="CONFIGURAÇÕES / ASSINE"
        title="Valores da página Assine"
        description="Altere aqui os preços exibidos no site. Não é necessário mudar código nem fazer novo deploy para reajustar os valores."
      />
      <SiteOfferSettingsPanel values={values} />
    </>
  );
}
