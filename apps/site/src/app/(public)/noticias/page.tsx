import { SiteHeader } from "../../../components/site/SiteHeader";
import { PublicReadAlsoCard } from "../../../components/site/public/PublicReadAlsoCard";
import { PublicPagination } from "../../../components/site/public/PublicPagination";
import { listPublicArticlesPage } from "../../../lib/public/publicContentService";

// Sempre no request — lista muda conforme novas matérias são publicadas.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

/**
 * "Todas as notícias" real (Fase 32) — diferente de `/editoria/[slug]`
 * (filtra por uma editoria): aqui é o conjunto completo de matérias
 * publicadas, sem filtro. Substitui o antigo `CategoryTemplatePage`
 * (mock, `category="noticias"`) — mesmo destino do link "Ver todas" de
 * Últimas notícias.
 *
 * Paginação real (Fase 39 — corrige o teto artificial de 60 que escondia
 * a maior parte do acervo já migrado do legado, mais de 4 mil matérias):
 * cada página busca só `PAGE_SIZE` matérias, nunca o acervo inteiro.
 */
export default async function NoticiasPage({
  searchParams,
}: {
  searchParams: { page?: string };
}): Promise<JSX.Element> {
  const requestedPage = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const { items: articles, total, page, totalPages } = await listPublicArticlesPage({ page: requestedPage, pageSize: PAGE_SIZE });

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="site-shell py-8">
        <h1 className="font-editorial text-3xl font-bold text-[color:var(--site-text)] md:text-4xl">Todas as notícias</h1>
        <p className="mt-2 text-sm text-[color:var(--site-muted)]">{total} matéria(s) publicada(s)</p>

        {articles.length === 0 ? (
          <p className="mt-8 text-[color:var(--site-muted)]">Nenhuma matéria publicada ainda.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
            {articles.map((item) => (
              <PublicReadAlsoCard key={item.id} item={item} />
            ))}
          </div>
        )}

        <PublicPagination currentPage={page} totalPages={totalPages} basePath="/noticias" />
      </section>
    </main>
  );
}
