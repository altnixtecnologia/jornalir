import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { NfseDraftForm } from "../../../../features/nfse/NfseDraftForm";
import { getIssuerConfigService, getServiceProfileService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Nova NFS-e — abas reais (Dados da nota/Tomador/Serviço e tributação/
 * Revisão), nunca um wizard longo. A NFS-e não depende de contrato/
 * assinatura/financeiro — só cliente (cadastro mestre, via ClientPicker
 * — nunca a lista inteira de clientes carregada aqui) + perfil de
 * serviço (opcional).
 */
export default async function NovaNfsePage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const [serviceProfiles, issuerConfig] = await Promise.all([
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
      <NfseDraftForm mode="create" serviceProfiles={serviceProfiles} issuerConfigured={Boolean(issuerConfig)} issuerConfig={issuerConfig} />
    </>
  );
}
