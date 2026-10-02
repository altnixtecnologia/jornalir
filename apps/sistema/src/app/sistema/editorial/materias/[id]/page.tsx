import { notFound } from "next/navigation";
import { ArticleNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ArticleForm } from "../../../../../features/editorial/ArticleForm";
import {
  getArticleService,
  getEditorialSectionService,
  getLocalityService,
  getNewspaperEditionService,
} from "../../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  getMediaAssetsByIdsSupabase,
  listRecentMediaAssetsSupabase,
} from "../../../../../providers/supabase/mediaAssetRepository.supabase";

export default async function MateriaEditPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { aba?: string };
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const article = await getArticleService(supabase).getById(params.id).catch((error: unknown) => {
    if (error instanceof ArticleNotFoundError) return null;
    throw error;
  });
  if (!article) notFound();

  const linkedMediaIds = article.media.map((item) => item.mediaAssetId);
  const [sections, localities, recentMedia, linkedMedia, editions] = await Promise.all([
    getEditorialSectionService(supabase).list(),
    getLocalityService(supabase).list(),
    listRecentMediaAssetsSupabase(supabase, 60),
    getMediaAssetsByIdsSupabase(supabase, linkedMediaIds),
    getNewspaperEditionService(supabase).list(),
  ]);

  // Sempre mantém disponíveis as mídias já vinculadas à matéria, mesmo que
  // sejam antigas e estejam fora das 60 mais recentes da biblioteca.
  const mediaById = new Map([...linkedMedia, ...recentMedia].map((asset) => [asset.id, asset]));
  const mediaAssets = [...mediaById.values()];

  const initialTab =
    searchParams?.aba === "imagens" || searchParams?.aba === "publicacao"
      ? searchParams.aba
      : "conteudo";

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / MATÉRIAS"
        title={article.title}
        description={`${article.reference} · edite os campos e escolha uma das ações de publicação.`}
      />
      <ArticleForm
        mode="edit"
        article={article}
        sections={sections}
        localities={localities}
        mediaAssets={mediaAssets}
        editions={editions}
        initialTab={initialTab}
      />
    </>
  );
}
