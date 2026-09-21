import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ArticleForm } from "../../../../../features/editorial/ArticleForm";
import {
  getEditorialSectionService,
  getLocalityService,
  getMediaAssetService,
} from "../../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export default async function NovaMateriaPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const [sections, localities, mediaAssets] = await Promise.all([
    getEditorialSectionService(supabase).list(),
    getLocalityService(supabase).list(),
    getMediaAssetService(supabase).list(),
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
