"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { PublicReadAlsoCard } from "../../../components/site/public/PublicReadAlsoCard";
import { listPublicArticlesPage } from "../../../lib/public/publicContentService";
import type { PublicArticle } from "../../../lib/public/types";
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, parsePage, parsePageSize, clampJumpPage, getPageBlock } from "../../../lib/public/pagination";

// "idle" (ETAPA A.1): sem termo nenhum, nunca dispara busca — nem
// "carregando todo o acervo" (requisição inútil) nem erro; só convida a
// digitar.
type LoadState = "idle" | "loading" | "ready" | "error";
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
        <main className="min-h-screen">
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

  // Fase 3A.1/3A.2: trim aplicado já na leitura — nunca manda nem compara
  // contra um termo com espaço sobrando (ex.: URL manual `?q=%20algo%20`).
  const q = (searchParams.get("q") ?? "").trim();
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));

  const [queryInput, setQueryInput] = useState(q);
  const [jumpValue, setJumpValue] = useState("");
  const [items, setItems] = useState<PublicArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<LoadState>(q ? "loading" : "idle");

  // Volta/Avança do navegador (ou qualquer navegação externa) muda `q`
  // na URL — sincroniza o campo de texto de volta, sem loop: só dispara
  // quando `q` realmente muda, nunca a cada tecla digitada (que só afeta
  // `queryInput`, não a URL, até o debounce comitar).
  useEffect(() => {
    setQueryInput(q);
  }, [q]);

  function navigate(overrides: { q?: string; page?: number; pageSize?: number }, mode: "push" | "replace") {
    const nextQ = (overrides.q ?? q).trim();
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
  // criar uma entrada de histórico por tecla. Trim antes de comparar/
  // enviar (3A.1/3A.2): digitar só espaços nunca dispara uma busca nem
  // suja a URL com `q=%20%20`.
  useEffect(() => {
    const trimmed = queryInput.trim();
    if (trimmed === q) return;
    const timer = setTimeout(() => {
      navigate({ q: trimmed, page: 1 }, "replace");
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à digitação; `navigate` fecha sobre q/page/pageSize atuais, que já estão nas deps via re-render.
  }, [queryInput]);

  useEffect(() => {
    let cancelled = false;

    // ETAPA A.1: sem termo, nunca busca "o acervo inteiro" por engano —
    // nem toca a rede. Estado "idle" é o convite inicial a pesquisar.
    if (!q) {
      setState("idle");
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      return;
    }

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
    <main className="min-h-screen">
      <SiteHeader />
      <section className="site-shell py-8">
        <h1 className="font-editorial text-3xl font-bold text-[color:var(--site-text)] md:text-4xl">Busca no Site</h1>

        {/* Fase 3A.1: Enter pesquisa imediatamente (não depende só do
            debounce); botão de pesquisar explícito (desktop e mobile);
            botão "limpar" só aparece com texto digitado. Input tem
            `aria-label` próprio — o placeholder some ao digitar e não é
            nome acessível confiável por si só. `shrink-0` no botão de
            busca garante que ele nunca comprime o campo no mobile. */}
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ q: queryInput, page: 1 }, "push");
          }}
          className="mt-4 flex items-stretch gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Buscar em todo o site"
              aria-label="Buscar no site"
              type="search"
              className="w-full rounded-lg border border-[color:var(--site-line)] bg-[color:var(--site-surface)] py-3 pl-4 pr-10 text-lg text-[color:var(--site-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-navy)] [&::-webkit-search-cancel-button]:hidden"
            />
            {queryInput ? (
              <button
                type="button"
                onClick={() => {
                  setQueryInput("");
                  navigate({ q: "", page: 1 }, "push");
                }}
                aria-label="Limpar busca"
                className="absolute inset-y-0 right-2 inline-flex items-center px-2 text-[color:var(--site-muted)] transition hover:text-[color:var(--brand-red)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-navy)]"
              >
                ✕
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            aria-label="Pesquisar"
            className="icon-btn shrink-0 border border-[color:var(--site-line)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        </form>

        {/* Região de status sempre montada (3C.2): `role="status"` com
            conteúdo vazio não ocupa espaço visível nem some do DOM entre
            estados — leitores de tela acompanham a mesma região em vez de
            precisar "descobrir" um elemento novo a cada troca. */}
        <p role="status" aria-live="polite" className={state === "loading" ? "mt-4 text-sm text-[color:var(--site-muted)]" : "sr-only"}>
          {state === "loading" ? "Carregando…" : ""}
        </p>
        {state === "idle" ? (
          <p className="mt-4 text-sm text-[color:var(--site-muted)]">Digite um termo acima para encontrar matérias publicadas no portal.</p>
        ) : null}
        {state === "error" ? (
          <p role="alert" className="mt-4 text-sm text-[color:var(--brand-red)]">Não foi possível carregar os resultados agora. Tente novamente em instantes.</p>
        ) : null}
        {state === "ready" ? (
          <>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm text-[color:var(--site-muted)]">
                {total} resultado(s){q ? ` para "${q}"` : ""}
              </p>
              <div role="group" aria-label="Itens por página" className="inline-flex overflow-hidden rounded-full border border-[color:var(--site-line)] text-xs">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => navigate({ pageSize: size, page: 1 }, "push")}
                    aria-current={size === pageSize ? "true" : undefined}
                    className={`px-3 py-1 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-navy)] ${
                      size === pageSize ? "bg-[color:var(--brand-red)] text-white" : "text-[color:var(--site-muted)] hover:bg-[color:var(--site-line)]/40"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Card/grid alinhados com /noticias e /editoria/[slug] (2B —
                "parecer claramente parte do mesmo portal"): mesmo
                PublicReadAlsoCard, mesma grade — antes a busca tinha um
                card e uma lista vertical só seus, sem foto. */}
            {items.length === 0 ? (
              <p className="mt-6 text-sm text-[color:var(--site-muted)]">
                {q ? `Nenhuma matéria encontrada para "${q}".` : "Nenhuma matéria encontrada."}
              </p>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
                {items.map((item) => (
                  <PublicReadAlsoCard key={item.id} item={item} />
                ))}
              </div>
            )}

            {totalPages > 1 ? (
              <>
                <nav className="mt-10 flex flex-wrap items-center justify-center gap-1 border-t border-[color:var(--site-line)] pt-6 sm:gap-1.5" aria-label="Paginação">
                  <PageButton disabled={page <= 1} onClick={() => navigate({ page: page - 1 }, "push")} ariaLabel="Página anterior">
                    ‹
                  </PageButton>
                  {(() => {
                    const block = getPageBlock(page, totalPages, 10);
                    return (
                      <>
                        {block.hasPrevBlock ? (
                          <PageButton onClick={() => navigate({ page: block.prevBlockPage }, "push")} ariaLabel="Bloco de páginas anterior">
                            «
                          </PageButton>
                        ) : null}
                        <div className="flex items-center gap-1">
                          {/* Mesmo tratamento de PublicPagination (3B.4/3B.6
                              — aparência consistente): some visualmente os
                              números "do meio" em telas estreitas, nunca
                              a atual/vizinhas/pontas do bloco. */}
                          {block.pages.map((p) => {
                            const isEdgeOrNear = p === page || Math.abs(p - page) <= 1 || p === block.pages[0] || p === block.pages[block.pages.length - 1];
                            return (
                              <PageButton key={p} active={p === page} hideOnMobile={!isEdgeOrNear} onClick={() => navigate({ page: p }, "push")}>
                                {p}
                              </PageButton>
                            );
                          })}
                        </div>
                        {block.hasNextBlock ? (
                          <PageButton onClick={() => navigate({ page: block.nextBlockPage }, "push")} ariaLabel="Próximo bloco de páginas">
                            »
                          </PageButton>
                        ) : null}
                      </>
                    );
                  })()}
                  <PageButton disabled={page >= totalPages} onClick={() => navigate({ page: page + 1 }, "push")} ariaLabel="Próxima página">
                    ›
                  </PageButton>
                </nav>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const target = clampJumpPage(jumpValue, totalPages);
                    if (target === null) return;
                    navigate({ page: target }, "push");
                    setJumpValue("");
                  }}
                  className="mt-4 flex items-center justify-center gap-2"
                >
                  <label className="flex items-center gap-2 text-xs text-[color:var(--site-muted)]">
                    Ir para página
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={jumpValue}
                      onChange={(event) => setJumpValue(event.target.value)}
                      placeholder={String(page)}
                      className="w-16 rounded-full border border-[color:var(--site-line)] bg-[color:var(--site-surface)] px-2 py-1 text-center text-sm text-[color:var(--site-text)]"
                      aria-label="Número da página"
                    />
                  </label>
                  <button type="submit" className="rounded-full bg-[color:var(--brand-red)] px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90">
                    Ir
                  </button>
                </form>
              </>
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
  hideOnMobile,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  hideOnMobile?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  const display = hideOnMobile ? "hidden sm:flex" : "flex";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={`${display} h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-navy)] disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? "bg-[color:var(--brand-red)] text-white" : "text-[color:var(--site-text)] hover:bg-[color:var(--site-line)]/40"
      }`}
    >
      {children}
    </button>
  );
}
