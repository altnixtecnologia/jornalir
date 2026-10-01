import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { DestaquesManager } from "../../../../features/editorial/DestaquesManager";
import {
  getArticleService,
  getEditorialSectionService,
  getLocalityService,
} from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getMediaAssetsByIdsSupabase } from "../../../../providers/supabase/mediaAssetRepository.supabase";

export default async function DestaquesPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const articleService = getArticleService(supabase);

  const [mainCover, highlightStrip, latestNews, localSpotlight, sections, localities] = await Promise.all([
    articleService.listActivePlacement("mainCover"),
    articleService.listActivePlacement("highlightStrip"),
    articleService.listActivePlacement("latestNews"),
    articleService.listActivePlacement("localSpotlight"),
    getEditorialSectionService(supabase).list(),
    getLocalityService(supabase).list(),
  ]);

  // Só as capas das matérias em destaque agora (nunca o acervo inteiro —
  // já são dezenas de milhares de mídias migradas do legado; carregar tudo
  // aqui derrubaria a página).
  const coverMediaAssetIds = [mainCover, highlightStrip, latestNews, localSpotlight]
    .flat()
    .map((article) => article.media.find((item) => item.role === "cover")?.mediaAssetId)
    .filter((id): id is string => Boolean(id));
  const mediaAssets = await getMediaAssetsByIdsSupabase(supabase, coverMediaAssetIds);

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / DESTAQUES"
        title="Destaques do portal"
        description="Onde cada matéria está aparecendo em destaque agora — fixe quando precisar e arraste as fixadas para ajustar a ordem."
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
