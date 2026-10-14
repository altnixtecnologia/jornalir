import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ArticleForm } from "../../../../../features/editorial/ArticleForm";
import {
  getEditorialSectionService,
  getLocalityService,
} from "../../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listRecentMediaAssetsSupabase } from "../../../../../providers/supabase/mediaAssetRepository.supabase";

export default async function NovaMateriaPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const rawPautaId = searchParams?.pauta;
  const pautaId = typeof rawPautaId === "string" && /^[0-9a-f-]{36}$/i.test(rawPautaId) ? rawPautaId : null;
  const supabase = createSupabaseServerClient();
  const [sections, localities, mediaAssets] = await Promise.all([
    getEditorialSectionService(supabase).list(),
    getLocalityService(supabase).list(),
    listRecentMediaAssetsSupabase(supabase, 60),
  ]);

  const { data: pauta } = pautaId
    ? await supabase.from("weekly_pauta_items").select("id, title, description, article_id").eq("id", pautaId).maybeSingle()
    : { data: null };
  const linkedPauta = pauta && !pauta.article_id ? pauta : null;

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / MATÉRIAS"
        title="Nova matéria"
        description="Título, subtítulo, corpo, editoria, localidade, imagens e programação em um só lugar."
      />
      <ArticleForm mode="create" sections={sections} localities={localities} mediaAssets={mediaAssets} initialTitle={linkedPauta?.title ?? ""} initialBody={linkedPauta?.description ?? ""} pautaId={linkedPauta?.id ?? undefined} />
    </>
  );
}
