import { notFound } from "next/navigation";
import { SiteHeader } from "../../../../components/site/SiteHeader";
import { PublicReadAlsoCard } from "../../../../components/site/public/PublicReadAlsoCard";
import { listPublicArticles, listPublicSections } from "../../../../lib/public/publicContentService";

// Sempre no request — lista muda conforme novas matérias são publicadas.
export const dynamic = "force-dynamic";

/**
 * Editoria real (Fase 30, item 4/7) — lista todas as matérias publicadas
 * de uma editoria ativa do banco. Independente das páginas de categoria
 * antigas (mock, `/geral` etc.) — essas continuam existindo para o
 * conteúdo de demonstração; esta é a página real por editoria do banco.
 */
export default async function EditoriaPage({ params }: { params: { slug: string } }): Promise<JSX.Element> {
  const sections = await listPublicSections();
  const section = sections.find((item) => item.slug === params.slug);
  if (!section) notFound();

  const articles = await listPublicArticles({ sectionId: section.id, limit: 40 });

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="site-shell py-8">
        <h1 className="font-editorial text-3xl font-bold text-[color:var(--site-text)] md:text-4xl">{section.name}</h1>
        <p className="mt-2 text-sm text-[color:var(--site-muted)]">{articles.length} matéria(s) publicada(s)</p>

        {articles.length === 0 ? (
          <p className="mt-8 text-[color:var(--site-muted)]">Nenhuma matéria publicada nesta editoria ainda.</p>
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
