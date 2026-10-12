"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { PublicReadAlsoCard } from "../../../components/site/public/PublicReadAlsoCard";
import { listPublicArticlesPage, listPublicSections } from "../../../lib/public/publicContentService";
import type { PublicArticle, PublicSection } from "../../../lib/public/types";
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE, parsePage, parsePageSize, clampJumpPage, getPageBlock } from "../../../lib/public/pagination";

type LoadState = "idle" | "loading" | "ready" | "error";
const DEBOUNCE_MS = 280;

export default function BuscaPage(): JSX.Element {
  return (
    <Suspense fallback={<main className="min-h-screen"><SiteHeader /></main>}>
      <BuscaContent />
    </Suspense>
  );
}

function BuscaContent(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = (searchParams.get("q") ?? "").trim();
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));
  const sectionId = searchParams.get("section") ?? "";
  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";

  const [queryInput, setQueryInput] = useState(q);
  const [jumpValue, setJumpValue] = useState("");
  const [items, setItems] = useState<PublicArticle[]>([]);
  const [sections, setSections] = useState<PublicSection[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = useState<LoadState>(q ? "loading" : "idle");

  useEffect(() => {
    setQueryInput(q);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    listPublicSections()
      .then((data) => {
        if (!cancelled) setSections([...data].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function navigate(
    overrides: {
      q?: string;
      page?: number;
      pageSize?: number;
      section?: string;
      from?: string;
      to?: string;
    },
    mode: "push" | "replace",
  ): void {
    const nextQ = (overrides.q ?? q).trim();
    const nextPage = overrides.page ?? page;
    const nextPageSize = overrides.pageSize ?? pageSize;
    const nextSection = overrides.section ?? sectionId;
    const nextFrom = overrides.from ?? dateFrom;
    const nextTo = overrides.to ?? dateTo;

    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextSection) params.set("section", nextSection);
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextPageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(nextPageSize));

    const qs = params.toString();
    router[mode](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const trimmed = queryInput.trim();
    if (trimmed === q) return;
    const timer = window.setTimeout(() => navigate({ q: trimmed, page: 1 }, "replace"), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput]);

  useEffect(() => {
    let cancelled = false;

    if (!q) {
      setState("idle");
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      return;
    }

    setState("loading");
    listPublicArticlesPage({
      query: q,
      page,
      pageSize,
      sectionId: sectionId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
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
  }, [q, page, pageSize, sectionId, dateFrom, dateTo]);

  const hasFilters = Boolean(sectionId || dateFrom || dateTo);
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    const section = sections.find((item) => item.id === sectionId);
    if (section) parts.push(section.name);
    if (dateFrom || dateTo) parts.push(`${dateFrom || "início"} até ${dateTo || "hoje"}`);
    return parts.join(" · ");
  }, [sections, sectionId, dateFrom, dateTo]);

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="site-shell py-8">
        <h1 className="font-editorial text-3xl font-bold text-[color:var(--site-text)] md:text-4xl">Busca no Site</h1>
        <p className="mt-1 text-sm text-[color:var(--site-muted)]">
          A busca prioriza o título. Se não encontrar, procura no subtítulo e depois no conteúdo da matéria.
        </p>

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
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Ex.: balão, futebol, prefeitura..."
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
                className="absolute inset-y-0 right-2 inline-flex items-center px-2 text-[color:var(--site-muted)] hover:text-[color:var(--brand-red)]"
              >
                ✕
              </button>
            ) : null}
          </div>
          <button type="submit" aria-label="Pesquisar" className="icon-btn shrink-0 border border-[color:var(--site-line)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        </form>

        <div className="search-filter-panel mt-4">
          <label>
            <span>Tema</span>
            <select
              value={sectionId}
              onChange={(event) => navigate({ section: event.target.value, page: 1 }, "push")}
            >
              <option value="">Todos os temas</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
          </label>

          <div className="search-period-filter">
            <span>Período</span>
            <div>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => navigate({ from: event.target.value, page: 1 }, "push")}
                aria-label="Data inicial"
              />
              <span aria-hidden="true">até</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => navigate({ to: event.target.value, page: 1 }, "push")}
                aria-label="Data final"
              />
            </div>
          </div>

          {hasFilters ? (
            <button
              type="button"
              className="search-clear-filters"
              onClick={() => navigate({ section: "", from: "", to: "", page: 1 }, "push")}
            >
              Limpar filtros
            </button>
          ) : (
            <span className="search-sort-note">Mais recentes primeiro</span>
          )}
        </div>

        <p role="status" aria-live="polite" className={state === "loading" ? "mt-4 text-sm text-[color:var(--site-muted)]" : "sr-only"}>
          {state === "loading" ? "Buscando…" : ""}
        </p>

        {state === "idle" ? (
          <p className="mt-4 text-sm text-[color:var(--site-muted)]">Digite um termo para pesquisar no acervo do portal.</p>
        ) : null}

        {state === "error" ? (
          <p role="alert" className="mt-4 text-sm text-[color:var(--brand-red)]">
            Não foi possível carregar os resultados agora. Tente novamente em instantes.
          </p>
        ) : null}

        {state === "ready" ? (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[color:var(--site-muted)]">
                {total} resultado(s) para “{q}”{filterSummary ? ` · ${filterSummary}` : ""}
              </p>
              <div role="group" aria-label="Itens por página" className="inline-flex overflow-hidden rounded-full border border-[color:var(--site-line)] text-xs">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => navigate({ pageSize: size, page: 1 }, "push")}
                    aria-current={size === pageSize ? "true" : undefined}
                    className={`px-3 py-1 font-semibold transition ${
                      size === pageSize
                        ? "bg-[color:var(--brand-red)] text-white"
                        : "text-[color:var(--site-muted)] hover:bg-[color:var(--site-line)]/40"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {items.length === 0 ? (
              <p className="mt-6 text-sm text-[color:var(--site-muted)]">Nenhuma matéria encontrada com esses critérios.</p>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
                {items.map((item) => <PublicReadAlsoCard key={item.id} item={item} />)}
              </div>
            )}

            {totalPages > 1 ? (
              <>
                <nav className="mt-10 flex flex-wrap items-center justify-center gap-1 border-t border-[color:var(--site-line)] pt-6 sm:gap-1.5" aria-label="Paginação">
                  <PageButton disabled={page <= 1} onClick={() => navigate({ page: page - 1 }, "push")} ariaLabel="Página anterior">‹</PageButton>
                  {(() => {
                    const block = getPageBlock(page, totalPages, 10);
                    return (
                      <>
                        {block.hasPrevBlock ? (
                          <PageButton onClick={() => navigate({ page: block.prevBlockPage }, "push")} ariaLabel="Bloco anterior">«</PageButton>
                        ) : null}
                        <div className="flex items-center gap-1">
                          {block.pages.map((number) => {
                            const isEdgeOrNear =
                              number === page ||
                              Math.abs(number - page) <= 1 ||
                              number === block.pages[0] ||
                              number === block.pages[block.pages.length - 1];
                            return (
                              <PageButton
                                key={number}
                                active={number === page}
                                hideOnMobile={!isEdgeOrNear}
                                onClick={() => navigate({ page: number }, "push")}
                              >
                                {number}
                              </PageButton>
                            );
                          })}
                        </div>
                        {block.hasNextBlock ? (
                          <PageButton onClick={() => navigate({ page: block.nextBlockPage }, "push")} ariaLabel="Próximo bloco">»</PageButton>
                        ) : null}
                      </>
                    );
                  })()}
                  <PageButton disabled={page >= totalPages} onClick={() => navigate({ page: page + 1 }, "push")} ariaLabel="Próxima página">›</PageButton>
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
                    />
                  </label>
                  <button type="submit" className="rounded-full bg-[color:var(--brand-red)] px-3 py-1 text-xs font-semibold text-white">Ir</button>
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
      className={`${display} h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? "bg-[color:var(--brand-red)] text-white" : "text-[color:var(--site-text)] hover:bg-[color:var(--site-line)]/40"
      }`}
    >
      {children}
    </button>
  );
}
