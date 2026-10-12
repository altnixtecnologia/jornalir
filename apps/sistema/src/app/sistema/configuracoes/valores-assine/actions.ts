"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

export interface SiteOfferSettingsFormInput {
  annualSubscriptionPrice: string;
  annualSubscriptionComboDiscount: string;

  printBusinessCardPrice: string;
  printBusinessCardComboDiscount: string;
  printStandardPrice: string;
  printStandardComboDiscount: string;
  printQuarterPrice: string;
  printQuarterComboDiscount: string;
  printHalfPrice: string;
  printHalfComboDiscount: string;
  printFullPrice: string;
  printFullComboDiscount: string;

  ledSjs1x2Price: string;
  ledSjs1x2ComboDiscount: string;
  ledPraiaGrande1x2Price: string;
  ledPraiaGrande1x2ComboDiscount: string;
  ledPassoTorres1x2Price: string;
  ledPassoTorres1x2ComboDiscount: string;
  ledSjs4x2Price: string;
  ledSjs4x2ComboDiscount: string;
}

type ActionResult = { error: string } | { ok: true };

function parseRequiredMoney(label: string, value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) throw new Error(`Informe o valor de ${label}.`);
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Valor inválido em ${label}.`);
  return Math.round(parsed * 100) / 100;
}

function parseOptionalMoney(label: string, value: string): number | null {
  if (!value.trim()) return null;
  return parseRequiredMoney(label, value);
}

export async function updateSiteOfferSettingsAction(
  input: SiteOfferSettingsFormInput,
): Promise<ActionResult> {
  try {
    const client = createSupabaseServerClient();
    const audit = await getAuditContext(client);

    const values = {
      annual_subscription_price: parseOptionalMoney("Assinatura anual", input.annualSubscriptionPrice),
      annual_subscription_combo_discount: parseRequiredMoney("Desconto da assinatura", input.annualSubscriptionComboDiscount),

      print_business_card_price: parseRequiredMoney("Cartão de visita", input.printBusinessCardPrice),
      print_business_card_combo_discount: parseRequiredMoney("Desconto do cartão de visita", input.printBusinessCardComboDiscount),
      print_standard_price: parseRequiredMoney("Padrão", input.printStandardPrice),
      print_standard_combo_discount: parseRequiredMoney("Desconto do padrão", input.printStandardComboDiscount),
      print_quarter_price: parseRequiredMoney("1/4 de página", input.printQuarterPrice),
      print_quarter_combo_discount: parseRequiredMoney("Desconto do 1/4 de página", input.printQuarterComboDiscount),
      print_half_price: parseRequiredMoney("Meia página", input.printHalfPrice),
      print_half_combo_discount: parseRequiredMoney("Desconto da meia página", input.printHalfComboDiscount),
      print_full_price: parseRequiredMoney("Página inteira", input.printFullPrice),
      print_full_combo_discount: parseRequiredMoney("Desconto da página inteira", input.printFullComboDiscount),

      led_sjs_1x2_price: parseRequiredMoney("Painel 1x2 m de São João do Sul", input.ledSjs1x2Price),
      led_sjs_1x2_combo_discount: parseRequiredMoney("Desconto do painel 1x2 m de São João do Sul", input.ledSjs1x2ComboDiscount),
      led_praia_grande_1x2_price: parseRequiredMoney("Painel 1x2 m de Praia Grande", input.ledPraiaGrande1x2Price),
      led_praia_grande_1x2_combo_discount: parseRequiredMoney("Desconto do painel 1x2 m de Praia Grande", input.ledPraiaGrande1x2ComboDiscount),
      led_passo_torres_1x2_price: parseRequiredMoney("Painel 1x2 m de Passo de Torres", input.ledPassoTorres1x2Price),
      led_passo_torres_1x2_combo_discount: parseRequiredMoney("Desconto do painel 1x2 m de Passo de Torres", input.ledPassoTorres1x2ComboDiscount),
      led_sjs_4x2_price: parseRequiredMoney("Painel 4x2 m da entrada de São João do Sul", input.ledSjs4x2Price),
      led_sjs_4x2_combo_discount: parseRequiredMoney("Desconto do painel 4x2 m da entrada de São João do Sul", input.ledSjs4x2ComboDiscount),
    };

    const { error } = await client.from("site_offer_settings").update(values).eq("id", 1);
    if (error) throw new Error(error.message);

    await recordAuditEventSupabase(client, {
      userId: audit.actorId,
      entityType: "site_offer_settings",
      entityId: "1",
      action: "update",
      metadata: values,
    });

    revalidatePath("/sistema/configuracoes/valores-assine");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar os valores." };
  }
}
