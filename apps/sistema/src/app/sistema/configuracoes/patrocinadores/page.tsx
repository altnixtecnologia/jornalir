import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { SiteAdSlotsPanel } from "../../../../features/configuracoes/SiteAdSlotsPanel";
import { getSiteAdSettingsService, getSiteAdSlotService } from "../../../../composition/siteAds";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Patrocinadores do site (Fase 6) — as 6 posições laterais do portal
 * público. NUNCA gera venda/Financeiro/NFS-e (benefício/brinde pra
 * quem anuncia no jornal impresso — ver Comercial/Publicidade pra isso,
 * módulo totalmente separado).
 */
export default async function SiteAdSlotsPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const [settings, slots] = await Promise.all([
    getSiteAdSettingsService(supabase).getCurrent(),
    getSiteAdSlotService(supabase).listWithMedia(),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow="CONFIGURAÇÕES / PATROCINADORES DO SITE"
        title="Patrocinadores do site"
        description="As 6 posições de publicidade lateral do portal público — benefício para quem anuncia no jornal impresso, nunca uma venda."
      />
      <SiteAdSlotsPanel settings={settings} slots={slots} />
    </>
  );
}
