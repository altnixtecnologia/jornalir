import Link from "next/link";
import { SiteHeader } from "../../components/site/SiteHeader";

/**
 * 404 do route group público — cobre tanto `notFound()` chamado por
 * páginas dentro de `(public)` (ex.: /noticias/[slug], /editoria/[slug])
 * quanto sub-rotas inexistentes dentro deste grupo. Mesmo padrão visual
 * de `error.tsx` (mesmo diretório) — texto deliberadamente DIFERENTE:
 * aqui é "não existe esse conteúdo", nunca "falha ao carregar".
 */
export default function PublicNotFound(): JSX.Element {
  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <section className="site-shell flex min-h-[60vh] flex-col items-center justify-center py-10 text-center">
        <h1 className="font-editorial text-3xl md:text-4xl">Página não encontrada</h1>
        <p className="mt-3 max-w-md text-sm" style={{ color: "var(--site-muted)" }}>
          O conteúdo que você procura pode ter sido removido ou o endereço está incorreto.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: "var(--brand-navy)" }}
          >
            Página inicial
          </Link>
          <Link
            href="/noticias"
            className="rounded-lg border px-4 py-2 text-sm font-semibold transition hover:bg-[color:var(--site-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderColor: "var(--site-line)", color: "var(--site-text)" }}
          >
            Ver notícias
          </Link>
        </div>
      </section>
    </main>
  );
}
