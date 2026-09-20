import { notFound } from "next/navigation";
import { ArticleNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ArticleForm } from "../../../../../features/editorial/ArticleForm";
import {
  articleService,
  editorialSectionService,
  localityService,
  mediaAssetService,
  newspaperEditionService,
} from "../../../../../composition/editorial";

export default async function MateriaEditPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const article = await articleService.getById(params.id).catch((error: unknown) => {
    if (error instanceof ArticleNotFoundError) return null;
    throw error;
  });
  if (!article) notFound();

  const [sections, localities, mediaAssets, editions] = await Promise.all([
    editorialSectionService.list(),
    localityService.list(),
    mediaAssetService.list(),
    newspaperEditionService.list(),
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
