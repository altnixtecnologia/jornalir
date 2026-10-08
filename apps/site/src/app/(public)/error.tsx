"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SiteHeader } from "../../components/site/SiteHeader";

export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }): JSX.Element {
  useEffect(() => {
    console.error("[public/error.tsx]", error);
  }, [error]);

  return (
    <main className="min-h-screen" style={{ background: "var(--site-bg)" }}>
      <SiteHeader />
      <section className="site-shell flex min-h-[60vh] flex-col items-center justify-center py-10 text-center">
        <h1 className="font-editorial text-3xl md:text-4xl">Não foi possível carregar esta página</h1>
        <p className="mt-3 max-w-md text-sm" style={{ color: "var(--site-muted)" }}>
          Algo deu errado por aqui. Tente novamente em instantes ou volte para o início.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: "var(--brand-navy)" }}
          >
            Tentar novamente
          </button>
          <Link
            href="/"
            className="rounded-lg border px-4 py-2 text-sm font-semibold transition hover:bg-[color:var(--site-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderColor: "var(--site-line)", color: "var(--site-text)" }}
          >
            Página inicial
          </Link>
        </div>
      </section>
    </main>
  );
}
