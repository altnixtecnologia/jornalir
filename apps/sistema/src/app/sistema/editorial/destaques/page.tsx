import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { DestaquesManager } from "../../../../features/editorial/DestaquesManager";
import {
  getArticleService,
  getEditorialSectionService,
  getLocalityService,
  getMediaAssetService,
} from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export default async function DestaquesPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const articleService = getArticleService(supabase);

  const [mainCover, highlightStrip, latestNews, localSpotlight, sections, localities, mediaAssets] =
    await Promise.all([
      articleService.listActivePlacement("mainCover"),
      articleService.listActivePlacement("highlightStrip"),
      articleService.listActivePlacement("latestNews"),
      articleService.listActivePlacement("localSpotlight"),
      getEditorialSectionService(supabase).list(),
      getLocalityService(supabase).list(),
      getMediaAssetService(supabase).list(),
    ]);

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / DESTAQUES"
        title="Destaques do portal"
        description="Onde cada matéria está aparecendo em destaque agora — fixar, desafixar e remover sem tocar em editoria, localidade ou status."
      />
      <DestaquesManager
        placements={{ mainCover, highlightStrip, latestNews, localSpotlight }}
        sections={sections}
        localities={localities}
        mediaAssets={mediaAssets}
      />
    </>
  );
}
