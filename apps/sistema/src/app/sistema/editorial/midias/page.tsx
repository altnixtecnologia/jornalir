import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { MidiasLibrary, type MediaUsageRef } from "../../../../features/editorial/MidiasLibrary";
import { PaginationControls } from "../../../../features/editorial/PaginationControls";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { listMediaAdminPageSupabase } from "../../../../providers/supabase/mediaAssetRepository.supabase";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function buildUsageByMediaId(
  client: SupabaseClient,
  mediaIds: string[],
): Promise<Record<string, MediaUsageRef[]>> {
  const usage: Record<string, MediaUsageRef[]> = {};
  if (mediaIds.length === 0) return usage;

  const { data: links, error: linksError } = await client
    .from("article_media")
    .select("media_id, article_id")
    .in("media_id", mediaIds);
  if (linksError) throw new Error(linksError.message);

  const articleIds = [...new Set((links ?? []).map((row) => row.article_id as string))];
  if (articleIds.length === 0) return usage;

  const { data: articles, error: articlesError } = await client
    .from("articles")
    .select("id, title")
    .in("id", articleIds);
  if (articlesError) throw new Error(articlesError.message);
  const titleById = new Map((articles ?? []).map((row) => [row.id as string, row.title as string]));

  for (const row of links ?? []) {
    const mediaId = row.media_id as string;
    const articleId = row.article_id as string;
    const title = titleById.get(articleId);
    if (!title) continue;
    const list = usage[mediaId] ?? [];
    list.push({ id: articleId, title });
    usage[mediaId] = list;
  }
  return usage;
}

export default async function MidiasPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const q = one(searchParams?.q).trim();
  const page = Math.max(1, Number(one(searchParams?.page)) || 1);
  const pageSize = Number(one(searchParams?.pageSize)) || 48;

  const mediaPage = await listMediaAdminPageSupabase(supabase, { page, pageSize, search: q });
  const usageByMediaId = await buildUsageByMediaId(
    supabase,
    mediaPage.assets.map((asset) => asset.id),
  );

  function href(targetPage: number): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(targetPage));
    params.set("pageSize", String(mediaPage.pageSize));
    return `/sistema/editorial/midias?${params.toString()}`;
  }

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / MÍDIAS"
        title="Biblioteca de mídia"
        description="Acervo paginado: imagens para capa e galeria sem carregar milhares de arquivos de uma vez."
      />

      <form className="materias-toolbar" method="get" action="/sistema/editorial/midias">
        <div className="materias-filters">
          <label className="materias-search">
            Buscar no acervo inteiro
            <input name="q" type="search" defaultValue={q} placeholder="Nome, referência, legenda ou crédito" />
          </label>
          <label>
            Por página
            <select name="pageSize" defaultValue={String(mediaPage.pageSize)}>
              <option value="24">24</option>
              <option value="48">48</option>
              <option value="96">96</option>
            </select>
          </label>
          <button type="submit">Buscar</button>
          <Link className="secondary-link" href="/sistema/editorial/midias">Limpar</Link>
        </div>
        <span className="materias-count">
          Página {mediaPage.page} de {mediaPage.totalPages} · {mediaPage.total} mídia(s)
        </span>
      </form>

      <MidiasLibrary mediaAssets={mediaPage.assets} usageByMediaId={usageByMediaId} />

      <PaginationControls page={mediaPage.page} totalPages={mediaPage.totalPages} buildHref={href} />
    </>
  );
}
