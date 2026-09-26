"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { formatDateBR } from "../../../components/site/date";
import { listPublicArticles } from "../../../lib/public/publicContentService";
import type { PublicArticle } from "../../../lib/public/types";

type LoadState = "loading" | "ready" | "error";

/** Busca real (Fase 30, item 11) — carrega matérias publicadas do banco uma vez e filtra no cliente (volume esperado de um jornal regional é pequeno). */
export default function BuscaPage(): JSX.Element {
  const [items, setItems] = useState<PublicArticle[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listPublicArticles({ limit: 200 })
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 30);
    return items.filter((item) =>
      `${item.title} ${item.subtitle ?? ""} ${item.body} ${item.sectionName}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader />
      <section className="site-shell py-7">
        <h1 className="font-editorial text-4xl">Busca no Site</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar em todo o site"
          className="mt-4 w-full rounded-lg border border-zinc-300 px-4 py-3 text-lg dark:border-zinc-700 dark:bg-zinc-900"
        />

        {state === "loading" ? <p className="mt-4 text-sm text-zinc-500">Carregando…</p> : null}
        {state === "error" ? (
          <p className="mt-4 text-sm text-red-600">Não foi possível carregar as matérias agora. Tente novamente em instantes.</p>
        ) : null}
        {state === "ready" ? (
          <>
            <p className="mt-2 text-sm text-zinc-500">{filtered.length} resultado(s)</p>
            {filtered.length === 0 ? (
              <p className="mt-6 text-sm text-zinc-500">Nenhuma matéria encontrada.</p>
            ) : (
              <div className="mt-5 space-y-3">
                {filtered.map((item) => (
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
          </>
        ) : null}
      </section>
    </main>
  );
}
