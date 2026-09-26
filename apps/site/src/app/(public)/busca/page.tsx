"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { formatDateBR } from "../../../components/site/date";
import { listPublicArticlesPage } from "../../../lib/public/publicContentService";
import type { PublicArticle } from "../../../lib/public/types";
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, parsePage, parsePageSize, getPageWindow } from "../../../lib/public/pagination";

type LoadState = "loading" | "ready" | "error";
const DEBOUNCE_MS = 300;

/**
 * `useSearchParams` exige um limite de Suspense (senão o Next tenta
 * pré-renderizar a página estaticamente e falha o build) — o conteúdo
 * real fica em `BuscaContent`, só o `Suspense` fica no componente de
 * página exportado.
 */
export default function BuscaPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
          <SiteHeader />
        </main>
      }
    >
      <BuscaContent />
    </Suspense>
  );
}

/**
 * Busca real (Fase 30, item 11), corrigida na Fase 39 e ajustada de novo
 * na revisão do ChatGPT sobre a Fase 39: `page`/`pageSize`/`q` são
 * derivados DIRETO de `useSearchParams()` a cada render — a URL é a
 * única fonte de verdade, nunca um `useState` espelhando-a. Isso é o que
 * faz Voltar/Avançar do navegador funcionar de verdade: quando o
 * navegador troca a URL (Back/Forward), o Next re-renderiza com os novos
 * `searchParams` automaticamente, sem precisar de nenhum efeito
 * "URL -> estado" que pudesse entrar em loop com o efeito contrário.
 * Só o campo de texto (`queryInput`) precisa de estado local, porque
 * digitar não pode navegar a cada tecla — só depois do debounce.
 * Trocar página/tamanho usa `router.push` (cria histórico navegável,
 * pedido explícito do usuário); o debounce da digitação usa
 * `router.replace` (não polui o histórico a cada tecla).
 */
function BuscaContent(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));

  const [queryInput, setQueryInput] = useState(q);
  const [items, setItems] = useState<PublicArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<LoadState>("loading");

  // Volta/Avança do navegador (ou qualquer navegação externa) muda `q`
  // na URL — sincroniza o campo de texto de volta, sem loop: só dispara
  // quando `q` realmente muda, nunca a cada tecla digitada (que só afeta
  // `queryInput`, não a URL, até o debounce comitar).
  useEffect(() => {
    setQueryInput(q);
  }, [q]);

  function navigate(overrides: { q?: string; page?: number; pageSize?: number }, mode: "push" | "replace") {
    const nextQ = overrides.q ?? q;
    const nextPage = overrides.page ?? page;
    const nextPageSize = overrides.pageSize ?? pageSize;

    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextPageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(nextPageSize));
    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    router[mode](href, { scroll: false });
  }

  // Debounce: só comita o termo digitado na URL 300ms depois de parar de
  // digitar (e sempre volta para a página 1) — usa `replace` para não
  // criar uma entrada de histórico por tecla.
  useEffect(() => {
    if (queryInput === q) return;
    const timer = setTimeout(() => {
      navigate({ q: queryInput, page: 1 }, "replace");
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à digitação; `navigate` fecha sobre q/page/pageSize atuais, que já estão nas deps via re-render.
  }, [queryInput]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    listPublicArticlesPage({ query: q, page, pageSize })
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
  }, [q, page, pageSize]);

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
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                {total} resultado(s){q ? ` para "${q}"` : ""}
              </p>
              <div className="inline-flex overflow-hidden rounded-full border border-zinc-300 text-xs dark:border-zinc-700">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => navigate({ pageSize: size, page: 1 }, "push")}
                    aria-current={size === pageSize ? "true" : undefined}
                    className={`px-3 py-1 font-semibold transition ${
                      size === pageSize ? "bg-[color:var(--brand-red)] text-white" : "text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

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
              <nav className="mt-6 flex items-center justify-center gap-1 border-t border-zinc-300 pt-4 dark:border-zinc-700" aria-label="Paginação">
                <PageButton disabled={page <= 1} onClick={() => navigate({ page: page - 1 }, "push")} ariaLabel="Página anterior">
                  ‹
                </PageButton>
                <div className="hidden items-center gap-1 sm:flex">
                  {getPageWindow(page, totalPages, 2).map((token, i) =>
                    token === "…" ? (
                      <span key={`dots-${i}`} className="px-2 text-zinc-500">
                        …
                      </span>
                    ) : (
                      <PageButton key={token} active={token === page} onClick={() => navigate({ page: token }, "push")}>
                        {token}
                      </PageButton>
                    ),
                  )}
                </div>
                <div className="flex items-center gap-1 sm:hidden">
                  {getPageWindow(page, totalPages, 1).map((token, i) =>
                    token === "…" ? (
                      <span key={`dots-m-${i}`} className="px-1.5 text-zinc-500">
                        …
                      </span>
                    ) : (
                      <PageButton key={token} active={token === page} onClick={() => navigate({ page: token }, "push")}>
                        {token}
                      </PageButton>
                    ),
                  )}
                </div>
                <PageButton disabled={page >= totalPages} onClick={() => navigate({ page: page + 1 }, "push")} ariaLabel="Próxima página">
                  ›
                </PageButton>
              </nav>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}

function PageButton({
  active,
  disabled,
  ariaLabel,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? "bg-[color:var(--brand-red)] text-white" : "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
