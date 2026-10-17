import Link from "next/link";
import { SiteHeader } from "../components/site/SiteHeader";

/**
 * 404 raiz — cobre URLs que não casam com NENHUMA rota (nem dentro de
 * `(public)`), caso em que o Next usa este arquivo em vez do
 * `(public)/not-found.tsx` (que só se aplica a páginas já dentro do
 * grupo). Mesmo texto/identidade visual do 404 público — mesma
 * experiência em qualquer "não encontrado" do site.
 */
export default function RootNotFound(): JSX.Element {
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
