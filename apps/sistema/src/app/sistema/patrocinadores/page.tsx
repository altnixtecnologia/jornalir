import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { redirect } from "next/navigation";
import { SiteAdSlotsPanel } from "../../../features/configuracoes/SiteAdSlotsPanel";
import { getSiteAdSlotService } from "../../../composition/siteAds";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SiteAdSlotsPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const {data:auth,error:authError}=await supabase.auth.getUser();
  if(authError||!auth.user)redirect("/login");
  const {data:authorized,error:permissionError}=await supabase.rpc("staff_can_module_action",{
    p_module:"patrocinadores",p_action:"gerenciar",
  });
  if(permissionError||authorized!==true)redirect("/sistema?acesso=negado");
  const slots = await getSiteAdSlotService(supabase).listWithMedia();

  return (
    <>
      <ModuleHeader
        eyebrow="PATROCINADORES / SITE"
        title="Patrocinadores do site"
        description="Adicione e atualize todas as imagens em uma biblioteca única. A esteira universal faz cada patrocinador circular automaticamente pelas seis posições do portal, preservando os ajustes individuais."
      />
      <SiteAdSlotsPanel slots={slots} />
    </>
  );
}
