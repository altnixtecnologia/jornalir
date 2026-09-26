import { notFound } from "next/navigation";
import { SiteHeader } from "../../../../components/site/SiteHeader";
import { PublicReadAlsoCard } from "../../../../components/site/public/PublicReadAlsoCard";
import { PublicPagination } from "../../../../components/site/public/PublicPagination";
import { PublicPageSizeSelect } from "../../../../components/site/public/PublicPageSizeSelect";
import { listPublicArticlesPage, listPublicSections } from "../../../../lib/public/publicContentService";
import { parsePage, parsePageSize } from "../../../../lib/public/pagination";

// Sempre no request — lista muda conforme novas matérias são publicadas.
export const dynamic = "force-dynamic";

/**
 * Editoria real (Fase 30, item 4/7) — lista todas as matérias publicadas
 * de uma editoria ativa do banco. Independente das páginas de categoria
 * antigas (mock, `/geral` etc.) — essas continuam existindo para o
 * conteúdo de demonstração; esta é a página real por editoria do banco.
 *
 * Paginação real (Fase 39 — corrige o teto artificial de 40 que escondia
 * a maior parte de editorias grandes, ex.: "Geral" tem mais de 3 mil
 * matérias só do legado já migrado). `page`/`pageSize` vivem na URL.
 */
export default async function EditoriaPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { page?: string; pageSize?: string };
}): Promise<JSX.Element> {
  const sections = await listPublicSections();
  const section = sections.find((item) => item.slug === params.slug);
  if (!section) notFound();

  const requestedPage = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const { items: articles, total, page, totalPages } = await listPublicArticlesPage({
    sectionId: section.id,
    page: requestedPage,
    pageSize,
  });

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="site-shell py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-editorial text-3xl font-bold text-[color:var(--site-text)] md:text-4xl">{section.name}</h1>
            <p className="mt-2 text-sm text-[color:var(--site-muted)]">{total} matéria(s) publicada(s)</p>
          </div>
          <PublicPageSizeSelect pageSize={pageSize} basePath={`/editoria/${section.slug}`} />
        </div>

        {articles.length === 0 ? (
          <p className="mt-8 text-[color:var(--site-muted)]">Nenhuma matéria publicada nesta editoria ainda.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
            {articles.map((item) => (
              <PublicReadAlsoCard key={item.id} item={item} />
            ))}
          </div>
        )}

        <PublicPagination currentPage={page} totalPages={totalPages} pageSize={pageSize} basePath={`/editoria/${section.slug}`} />
      </section>
    </main>
  );
}
