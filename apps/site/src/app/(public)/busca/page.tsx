"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { formatDateBR } from "../../../components/site/date";
import { listPublicArticlesPage } from "../../../lib/public/publicContentService";
import type { PublicArticle } from "../../../lib/public/types";

type LoadState = "loading" | "ready" | "error";

const PAGE_SIZE = 30;
const DEBOUNCE_MS = 300;

/**
 * Busca real (Fase 30, item 11), corrigida na Fase 39: antes carregava até
 * 200 matérias no navegador e filtrava ali — com o acervo do legado
 * migrado (mais de 4 mil matérias), isso deixava a maior parte inalcançável
 * e o teto de 200 escondia resultados reais. Agora cada busca/página é uma
 * consulta paginada no Supabase (`ilike` em título/subtítulo/corpo,
 * `published_at DESC`), nunca o acervo inteiro no navegador.
 */
export default function BuscaPage(): JSX.Element {
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PublicArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<LoadState>("loading");

  // Debounce: só dispara a busca real 300ms depois de parar de digitar, e
  // sempre volta para a página 1 quando o termo muda.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(queryInput);
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    listPublicArticlesPage({ query: debouncedQuery, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page]);

  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader />
      <section className="site-shell py-7">
        <h1 className="font-editorial text-4xl">Busca no Site</h1>
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Buscar em todo o site"
          className="mt-4 w-full rounded-lg border border-zinc-300 px-4 py-3 text-lg dark:border-zinc-700 dark:bg-zinc-900"
        />

        {state === "loading" ? <p className="mt-4 text-sm text-zinc-500">Carregando…</p> : null}
        {state === "error" ? (
          <p className="mt-4 text-sm text-red-600">Não foi possível carregar as matérias agora. Tente novamente em instantes.</p>
        ) : null}
        {state === "ready" ? (
          <>
            <p className="mt-2 text-sm text-zinc-500">
              {total} resultado(s){debouncedQuery ? ` para "${debouncedQuery}"` : ""}
            </p>
            {items.length === 0 ? (
              <p className="mt-6 text-sm text-zinc-500">Nenhuma matéria encontrada.</p>
            ) : (
              <div className="mt-5 space-y-3">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/noticias/${item.slug}`}
                    className="block rounded-lg border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <h3 className="text-xl font-semibold">{item.title}</h3>
                    {item.subtitle ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{item.subtitle}</p> : null}
                    <p className="mt-2 text-xs text-zinc-500">
                      {item.sectionName} · {formatDateBR(item.publishedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            )}

            {totalPages > 1 ? (
              <nav className="mt-6 flex items-center justify-between border-t border-zinc-300 pt-4 dark:border-zinc-700" aria-label="Paginação">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="text-sm font-semibold text-[color:var(--brand-red)] disabled:opacity-30"
                >
                  ← Anterior
                </button>
                <span className="text-sm text-zinc-500">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="text-sm font-semibold text-[color:var(--brand-red)] disabled:opacity-30"
                >
                  Próxima →
                </button>
              </nav>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
