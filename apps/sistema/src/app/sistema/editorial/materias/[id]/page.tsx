import { notFound } from "next/navigation";
import { ArticleNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ArticleForm } from "../../../../../features/editorial/ArticleForm";
import {
  getArticleService,
  getEditorialSectionService,
  getLocalityService,
  getMediaAssetService,
  getNewspaperEditionService,
} from "../../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export default async function MateriaEditPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const article = await getArticleService(supabase).getById(params.id).catch((error: unknown) => {
    if (error instanceof ArticleNotFoundError) return null;
    throw error;
  });
  if (!article) notFound();

  const [sections, localities, mediaAssets, editions] = await Promise.all([
    getEditorialSectionService(supabase).list(),
    getLocalityService(supabase).list(),
    getMediaAssetService(supabase).list(),
    getNewspaperEditionService(supabase).list(),
  ]);

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
      />
    </>
  );
}
