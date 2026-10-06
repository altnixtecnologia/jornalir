import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { NfseDraftForm } from "../../../../features/nfse/NfseDraftForm";
import { getIssuerConfigService, getServiceProfileService } from "../../../../composition/nfse";
import { getClientService } from "../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Nova NFS-e (Parte 1, item 8) — página única em seções, nunca um
 * wizard longo. A NFS-e não depende de contrato/assinatura/financeiro
 * — só cliente (cadastro mestre) + perfil de serviço (opcional).
 */
export default async function NovaNfsePage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const [clients, serviceProfiles, issuerConfig] = await Promise.all([
    getClientService(supabase).list(),
    getServiceProfileService(supabase).list(),
    getIssuerConfigService(supabase).getCurrent(),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e / NOVA"
        title="Nova NFS-e"
        description="Tomador, serviço, valores, tributação e descrição — salvos como rascunho. Nenhuma transmissão real ainda."
      />
      <NfseDraftForm mode="create" clients={clients} serviceProfiles={serviceProfiles} issuerConfigured={Boolean(issuerConfig)} />
    </>
  );
}
