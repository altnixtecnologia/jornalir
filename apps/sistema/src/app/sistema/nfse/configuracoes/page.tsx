import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { NfseIssuerConfigForm } from "../../../../features/nfse/NfseIssuerConfigForm";
import { getIssuerConfigService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Configurações fiscais da NFS-e (Parte 1, item 4) — prestador, regime
 * fiscal, ambiente e certificado (metadata). Nenhum valor é assumido
 * silenciosamente; os dados sugeridos da Informativo Regional só
 * aparecem como valor inicial quando NENHUMA configuração existe
 * ainda, nunca persistidos sem confirmação explícita.
 */
export default async function NfseConfiguracoesPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const service = getIssuerConfigService(supabase);
  const current = await service.getCurrent();
  const initialConfig = current ?? { ...service.getSuggestedDefaults(), id: "", createdAt: "", updatedAt: "" };

  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e / CONFIGURAÇÕES"
        title="Configurações fiscais"
        description="Prestador, regime/configuração fiscal, ambiente e certificado digital (metadata)."
      />
      <NfseIssuerConfigForm initialConfig={initialConfig} />
    </>
  );
}
