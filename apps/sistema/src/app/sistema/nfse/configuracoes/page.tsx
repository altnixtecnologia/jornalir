import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { isSecretStoreConfigured } from "@ir/core/src/nfse/secret-store";
import { getNfseEnvironmentConfig } from "@ir/core/src/nfse/environment";
import { NfseIssuerConfigForm } from "../../../../features/nfse/NfseIssuerConfigForm";
import { NfseDiagnosticsPanel } from "../../../../features/nfse/NfseDiagnosticsPanel";
import { NfseMunicipalParametersPanel } from "../../../../features/nfse/NfseMunicipalParametersPanel";
import { getIssuerConfigService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { hasServiceRoleKey } from "../../../../lib/supabase/admin";

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
  const homologationEnvironment = getNfseEnvironmentConfig("homologation");
  const productionEnvironment = getNfseEnvironmentConfig("production");

  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e / CONFIGURAÇÕES"
        title="Configurações fiscais"
        description="Prestador, regime/configuração fiscal, ambiente e certificado digital (metadata)."
      />
      <NfseDiagnosticsPanel
        masterKeyConfigured={isSecretStoreConfigured()}
        supabaseAdminConfigured={hasServiceRoleKey()}
        environmentLabel={homologationEnvironment.label}
        productionBlocked={!productionEnvironment.operationsEnabled}
      />
      <NfseMunicipalParametersPanel />
      <NfseIssuerConfigForm initialConfig={initialConfig} encryptionReady={isSecretStoreConfigured()} />
    </>
  );
}
