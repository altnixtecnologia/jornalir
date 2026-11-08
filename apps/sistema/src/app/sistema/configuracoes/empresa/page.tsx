import { notFound } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { requireAdminOrOwner } from "../../../../lib/auth/requireAdminOrOwner";
import {
  CompanySettingsManager,
  type CompanyProfileRecord,
  type LegalRepresentativeRecord,
} from "../../../../features/configuracoes/CompanySettingsManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Configurações → Dados da empresa e representante legal (somente administrador/proprietário). */
export default async function CompanySettingsPage(): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const guard = await requireAdminOrOwner(client);
  if (!guard.ok) notFound();

  const [{ data: company }, { data: reps }] = await Promise.all([
    client.from("company_profile").select("*").maybeSingle(),
    client
      .from("company_legal_representatives")
      .select(
        "id, full_name, cpf, role_title, nationality, email, phone, representation_rule, powers_description, powers_evidence_note, powers_valid_from, powers_valid_until, active, is_default, signature_sha256, signature_bytes, signature_updated_at",
      )
      .order("active", { ascending: false })
      .order("full_name"),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow="CONFIGURAÇÕES / CONTRATOS"
        title="Dados da empresa e representante legal"
        description="Identificação da CONTRATADA (Jornal IR) e de quem pode assiná-la em contratos institucionais. Nenhuma assinatura é aplicada por esta tela."
      />
      <CompanySettingsManager
        company={(company as CompanyProfileRecord | null) ?? null}
        representatives={(reps ?? []) as LegalRepresentativeRecord[]}
      />
    </>
  );
}
