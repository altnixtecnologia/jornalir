import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { NfseServiceProfilesPanel } from "../../../../features/nfse/NfseServiceProfilesPanel";
import { getServiceProfileService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NfsePerfisServicoPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const profiles = await getServiceProfileService(supabase).list();

  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e / PERFIS DE SERVIÇO"
        title="Perfis de serviço"
        description="Evita preencher toda a configuração fiscal manualmente em cada emissão."
      />
      <NfseServiceProfilesPanel profiles={profiles} />
    </>
  );
}
