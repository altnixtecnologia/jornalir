"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getAuditContext } from "../../../../lib/auth/getAuditContext";
import { recordAuditEventSupabase } from "../../../../providers/supabase/auditEvents.supabase";

export interface SiteOfferSettingsFormInput {
  annualSubscriptionPrice: string;
  printBusinessCardPrice: string;
  printStandardPrice: string;
  printQuarterPrice: string;
  printHalfPrice: string;
  printFullPrice: string;
  ledThreeCitiesPrice: string;
  comboBusinessCardLedPrice: string;
  comboStandardLedPrice: string;
  comboQuarterLedPrice: string;
  comboHalfLedPrice: string;
  comboFullLedPrice: string;
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
      print_business_card_price: parseRequiredMoney("Cartão de visita", input.printBusinessCardPrice),
      print_standard_price: parseRequiredMoney("Padrão", input.printStandardPrice),
      print_quarter_price: parseRequiredMoney("1/4 de página", input.printQuarterPrice),
      print_half_price: parseRequiredMoney("Meia página", input.printHalfPrice),
      print_full_price: parseRequiredMoney("Página inteira", input.printFullPrice),
      led_three_cities_price: parseRequiredMoney("3 painéis de LED", input.ledThreeCitiesPrice),
      combo_business_card_led_price: parseRequiredMoney("Cartão + painéis", input.comboBusinessCardLedPrice),
      combo_standard_led_price: parseRequiredMoney("Padrão + painéis", input.comboStandardLedPrice),
      combo_quarter_led_price: parseRequiredMoney("1/4 + painéis", input.comboQuarterLedPrice),
      combo_half_led_price: parseRequiredMoney("Meia página + painéis", input.comboHalfLedPrice),
      combo_full_led_price: parseRequiredMoney("Página inteira + painéis", input.comboFullLedPrice),
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
