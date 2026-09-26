import { SiteHeader } from "../../../components/site/SiteHeader";
import { PublicReadAlsoCard } from "../../../components/site/public/PublicReadAlsoCard";
import { listPublicArticles } from "../../../lib/public/publicContentService";

// Sempre no request — lista muda conforme novas matérias são publicadas.
export const dynamic = "force-dynamic";

/**
 * "Todas as notícias" real (Fase 32) — diferente de `/editoria/[slug]`
 * (filtra por uma editoria): aqui é o conjunto completo de matérias
 * publicadas, sem filtro. Substitui o antigo `CategoryTemplatePage`
 * (mock, `category="noticias"`) — mesmo destino do link "Ver todas" de
 * Últimas notícias.
 */
export default async function NoticiasPage(): Promise<JSX.Element> {
  const articles = await listPublicArticles({ limit: 60 });

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="site-shell py-8">
        <h1 className="font-editorial text-3xl font-bold text-[color:var(--site-text)] md:text-4xl">Todas as notícias</h1>
        <p className="mt-2 text-sm text-[color:var(--site-muted)]">{articles.length} matéria(s) publicada(s)</p>

        {articles.length === 0 ? (
          <p className="mt-8 text-[color:var(--site-muted)]">Nenhuma matéria publicada ainda.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
            {articles.map((item) => (
              <PublicReadAlsoCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
