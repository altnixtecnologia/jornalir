import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import {
  SiteOfferSettingsPanel,
  type SiteOfferSettingsValues,
} from "../../../../features/configuracoes/SiteOfferSettingsPanel";
import { AssineVisibilityToggle } from "../../../../features/configuracoes/AssineVisibilityToggle";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SiteOfferSettingsPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data, error } = await client
    .from("site_offer_settings")
    .select(
      "annual_subscription_price, annual_subscription_combo_discount, print_business_card_price, print_business_card_combo_discount, print_standard_price, print_standard_combo_discount, print_quarter_price, print_quarter_combo_discount, print_half_price, print_half_combo_discount, print_full_price, print_full_combo_discount, led_sjs_1x2_price, led_sjs_1x2_combo_discount, led_praia_grande_1x2_price, led_praia_grande_1x2_combo_discount, led_passo_torres_1x2_price, led_passo_torres_1x2_combo_discount, led_sjs_4x2_price, led_sjs_4x2_combo_discount, assine_enabled",
    )
    .eq("id", 1)
    .single();

  if (error) throw new Error(error.message);
  // Falha-fechado também na leitura administrativa: coluna ausente (migration
  // ainda não aplicada) ou nula nunca é tratada como "ativado".
  const assineEnabled = (data as { assine_enabled?: boolean | null }).assine_enabled === true;

  const values: SiteOfferSettingsValues = {
    annualSubscriptionPrice: data.annual_subscription_price === null ? null : Number(data.annual_subscription_price),
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

    ledSjs1x2Price: Number(data.led_sjs_1x2_price),
    ledSjs1x2ComboDiscount: Number(data.led_sjs_1x2_combo_discount),
    ledPraiaGrande1x2Price: Number(data.led_praia_grande_1x2_price),
    ledPraiaGrande1x2ComboDiscount: Number(data.led_praia_grande_1x2_combo_discount),
    ledPassoTorres1x2Price: Number(data.led_passo_torres_1x2_price),
    ledPassoTorres1x2ComboDiscount: Number(data.led_passo_torres_1x2_combo_discount),
    ledSjs4x2Price: Number(data.led_sjs_4x2_price),
    ledSjs4x2ComboDiscount: Number(data.led_sjs_4x2_combo_discount),
  };

  return (
    <>
      <ModuleHeader
        eyebrow="CONFIGURAÇÕES / ASSINE"
        title="Valores e descontos da página Assine"
        description="Defina preços, descontos por combinação e quais painéis aparecem no site."
      />
      <AssineVisibilityToggle initialEnabled={assineEnabled} />
      <SiteOfferSettingsPanel values={values} />
    </>
  );
}
