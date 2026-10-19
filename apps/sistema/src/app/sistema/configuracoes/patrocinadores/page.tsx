import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { SiteAdSlotsPanel } from "../../../../features/configuracoes/SiteAdSlotsPanel";
import { getSiteAdSlotService } from "../../../../composition/siteAds";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SiteAdSlotsPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const slots = await getSiteAdSlotService(supabase).listWithMedia();

  return (
    <>
      <ModuleHeader
        eyebrow="CONFIGURAÇÕES / PATROCINADORES DO SITE"
        title="Patrocinadores do site"
        description="Organize as imagens em seis grupos. No site, os grupos circulam automaticamente entre as três fileiras, nos lados esquerdo e direito, mantendo o tempo e os efeitos configurados por imagem."
      />
      <SiteAdSlotsPanel slots={slots} />
    </>
  );
}
