"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import type { ContractSettings } from "../../../../lib/contracts/contractTemplates";

type SaveResult = { ok: true } | { error: string };

export async function saveContractDocumentSettings(form: FormData): Promise<SaveResult> {
  const client = createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return { error: "Faça login novamente." };
  const { data: profile } = await client.from("profiles")
    .select("role, active").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active || (profile.role !== "owner" && profile.role !== "admin")) {
    return { error: "Somente administradores podem configurar modelos contratuais." };
  }
  const fields: Record<keyof ContractSettings, string> = {
    legalName: "legal_name", tradeName: "trade_name", cnpj: "cnpj",
    representative: "representative", address: "address", phone: "phone", email: "email",
    annualText: "annual_text", printText: "print_text", ledText: "led_text", mixedText: "mixed_text",
  };
  const payload: Record<string, string | number> = { id: 1 };
  for (const [field, dbField] of Object.entries(fields)) {
    const value = String(form.get(field) ?? "").trim();
    if (value.length > (field.endsWith("Text") ? 10000 : 300)) {
      return { error: "Um dos campos excede o tamanho permitido." };
    }
    payload[dbField] = value;
  }
  const cnpj = String(payload.cnpj).replace(/\D/g, "");
  if (cnpj && cnpj.length !== 14) return { error: "Confira o CNPJ informado." };
  if (!String(payload.trade_name).trim()) return { error: "Informe o nome público do jornal." };
  const { error } = await client.from("contract_document_settings").upsert({
    ...payload, updated_by: auth.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) return { error: "Não foi possível salvar. Verifique se a migration de configurações foi homologada." };
  revalidatePath("/sistema/configuracoes/contratos");
  revalidatePath("/sistema/contratos/previa");
  return { ok: true };
}
