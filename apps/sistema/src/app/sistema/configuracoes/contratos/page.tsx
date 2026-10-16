import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { DRAFT_CONTRACT_SETTINGS, normalizeContractSettings } from "../../../../lib/contracts/contractTemplates";
import { ContractSettingsForm } from "./ContractSettingsForm";

export const dynamic = "force-dynamic";

export default async function ContractDocumentSettingsPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role, active").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active || !["owner", "admin"].includes(profile.role)) redirect("/sistema?acesso=negado");
  const { data, error } = await client.from("contract_document_settings").select("*").eq("id", 1).maybeSingle();
  return (
    <>
      <ModuleHeader eyebrow="CONFIGURAÇÕES / DOCUMENTOS" title="Modelos de contratos"
        description="Dados oficiais do jornal, cláusulas por produto e revisão antes do envio." />
      <ContractSettingsForm initial={error ? DRAFT_CONTRACT_SETTINGS : normalizeContractSettings(data as Record<string, unknown> | null)} storageReady={!error} />
    </>
  );
}
