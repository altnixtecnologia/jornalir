"use client";

import { PaginationControls } from "./PaginationControls";

/**
 * Ponte client-safe para `PaginationControls` quando quem chama é um
 * Server Component (listagens de Clientes/Assinaturas/Contas a
 * Receber/Mídias). `PaginationControls.buildHref` é uma função — nunca
 * pode atravessar a fronteira servidor→cliente (regra do React Server
 * Components). Aqui ela recebe só dados serializáveis (`basePath` +
 * `params`) e monta o `buildHref` localmente, já do lado do cliente —
 * mesmo princípio que `MateriasList` já usa (closure definida dentro do
 * próprio client component, nunca recebida de fora).
 */
export function PaginatedNav({
  basePath,
  page,
  totalPages,
  params,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  params: Record<string, string>;
}): JSX.Element | null {
  function buildHref(targetPage: number): string {
    const search = new URLSearchParams(params);
    search.set("page", String(targetPage));
    return `${basePath}?${search.toString()}`;
  }

  return <PaginationControls page={page} totalPages={totalPages} buildHref={buildHref} />;
}
