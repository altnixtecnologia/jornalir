import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { MidiasLibrary, type MediaUsageRef } from "../../../../features/editorial/MidiasLibrary";
import { articleService, mediaAssetService } from "../../../../composition/editorial";

/**
 * Vínculo com matéria (quando houver) é calculado aqui, cruzando
 * `Article.media` com o catálogo de mídia — não é um campo guardado na
 * mídia, para não duplicar a fonte de verdade.
 */
function buildUsageByMediaId(articles: Awaited<ReturnType<typeof articleService.list>>): Record<string, MediaUsageRef[]> {
  const usage: Record<string, MediaUsageRef[]> = {};
  for (const article of articles) {
    for (const item of article.media) {
      const list = usage[item.mediaAssetId] ?? [];
      list.push({ id: article.id, title: article.title });
      usage[item.mediaAssetId] = list;
    }
  }
  return usage;
}

export default async function MidiasPage(): Promise<JSX.Element> {
  const [mediaAssets, articles] = await Promise.all([mediaAssetService.list(), articleService.list()]);
  const usageByMediaId = buildUsageByMediaId(articles);

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / MÍDIAS"
        title="Biblioteca de mídia"
        description="Imagens disponíveis para capa e galeria das matérias. Ainda sem storage real — cadastro por referência de URL já hospedada."
      />
      <MidiasLibrary mediaAssets={mediaAssets} usageByMediaId={usageByMediaId} />
    </>
  );
}
