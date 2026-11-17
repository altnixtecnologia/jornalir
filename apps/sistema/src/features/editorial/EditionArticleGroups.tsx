import Link from "next/link";
import type { Article, NewspaperEdition } from "@ir/types";
import { articleOriginLabels, articleStatusLabels } from "./editorialLabels";

export interface EditorialEditionGroup {
  edition: NewspaperEdition;
  articles: Article[];
  total: number;
}

export function EditionArticleGroups({ groups }: { groups: EditorialEditionGroup[] }): JSX.Element {
  if (!groups.length) {
    return (
      <section className="materias-empty">
        Nenhuma matéria vinculada às edições recentes. Use “Ver todas e filtrar” para consultar o acervo histórico.
      </section>
    );
  }
  return (
    <div className="editorial-edition-groups">
      {groups.map(({ edition, articles, total }) => (
        <details className="editorial-edition-group" key={edition.id} open>
          <summary>
            <span>Edição {edition.editionNumber}
              <small>{edition.title || "Jornal impresso"}</small>
            </span>
            <small>{total.toLocaleString("pt-BR")} matéria(s)</small>
          </summary>
          <div className="editorial-edition-group-body">
            {articles.map((article) => (
              <div className="editorial-edition-article" key={article.id}>
                <small>{article.reference}</small>
                <div>
                  <Link href={"/sistema/editorial/materias/" + article.id}>{article.title}</Link>
                  <div><small>
                    {article.editionPageNumber ? "Página " + article.editionPageNumber + " · " : ""}
                    {articleStatusLabels[article.status]}
                  </small></div>
                </div>
                <span className={"origin-pill origin-pill--" + article.origin}>
                  {articleOriginLabels[article.origin]}
                </span>
              </div>
            ))}
          </div>
          <div className="editorial-edition-footer">
            <Link className="secondary-link" href={"/sistema/editorial/materias?view=all&edition=" + edition.id}>
              {articles.length < total ? "Ver todas as matérias desta edição" : "Filtrar esta edição"}
            </Link>
          </div>
        </details>
      ))}
    </div>
  );
}
