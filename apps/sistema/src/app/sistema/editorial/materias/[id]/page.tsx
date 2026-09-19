import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import {
  articleService,
  editorialSectionService,
  localityService,
} from "../../../../../composition/editorial";
import {
  articleStatusLabels,
  formatDateTime,
  mediaSummary,
  notificationLabels,
  placementLabels,
} from "../../../../../features/editorial/editorialLabels";

export default async function MateriaDetailPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const article = await articleService.getById(params.id).catch((error: unknown) => {
    if (error instanceof ArticleNotFoundError) return null;
    throw error;
  });
  if (!article) notFound();

  const [sections, localities] = await Promise.all([
    editorialSectionService.list(),
    localityService.list(),
  ]);
  const section = sections.find((item) => item.id === article.sectionId);
  const locality = localities.find((item) => item.id === article.localityId);

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / MATÉRIAS"
        title={article.title}
        description={`${article.reference} · ${section?.name ?? "Editoria não encontrada"} · ${locality?.name ?? "Localidade não encontrada"}`}
        action={
          <Link className="secondary-link" href="/sistema/editorial/materias">
            Voltar à listagem
          </Link>
        }
      />
      <div className="article-detail">
        <div className="article-detail-main">
          <span className={`status-pill status-pill--${article.status}`}>
            {articleStatusLabels[article.status]}
          </span>
          {article.subtitle ? <p className="materia-subtitle">{article.subtitle}</p> : null}
          <p className="article-body-preview">{article.body}</p>
        </div>
        <dl className="article-detail-meta meta-list">
          <div>
            <dt>Referência</dt>
            <dd>{article.reference}</dd>
          </div>
          <div>
            <dt>Editoria</dt>
            <dd>{section?.name ?? "—"}</dd>
          </div>
          <div>
            <dt>Localidade</dt>
            <dd>{locality?.name ?? "—"}</dd>
          </div>
          <div>
            <dt>Destaque</dt>
            <dd>{placementLabels[article.placement.type]}</dd>
          </div>
          <div>
            <dt>Notificação</dt>
            <dd>{notificationLabels[article.notificationMode]}</dd>
          </div>
          <div>
            <dt>Imagens</dt>
            <dd>{mediaSummary(article)}</dd>
          </div>
          <div>
            <dt>Origem</dt>
            <dd>{article.origin === "pdfImport" ? "Importada de edição em PDF" : "Cadastro manual"}</dd>
          </div>
          <div>
            <dt>Publicada em</dt>
            <dd>{formatDateTime(article.publishedAt)}</dd>
          </div>
          <div>
            <dt>Programada para</dt>
            <dd>{formatDateTime(article.scheduledAt)}</dd>
          </div>
          <div>
            <dt>Criada em</dt>
            <dd>{formatDateTime(article.createdAt)}</dd>
          </div>
          <div>
            <dt>Última atualização</dt>
            <dd>{formatDateTime(article.updatedAt)}</dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd>{article.createdBy}</dd>
          </div>
        </dl>
      </div>
      <p className="editorial-rule">
        Esta é uma visualização do estado atual da matéria. O editor completo, com
        formatação de título, subtítulo, corpo, galeria e programação, chega em uma
        próxima etapa.
      </p>
    </>
  );
}
