import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ArticleForm } from "../../../../../features/editorial/ArticleForm";
import {
  editorialSectionService,
  localityService,
  mediaAssetService,
} from "../../../../../composition/editorial";

export default async function NovaMateriaPage(): Promise<JSX.Element> {
  const [sections, localities, mediaAssets] = await Promise.all([
    editorialSectionService.list(),
    localityService.list(),
    mediaAssetService.list(),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / MATÉRIAS"
        title="Nova matéria"
        description="Título, subtítulo, corpo, editoria, localidade, imagens e programação em um só lugar."
      />
      <ArticleForm mode="create" sections={sections} localities={localities} mediaAssets={mediaAssets} />
    </>
  );
}
