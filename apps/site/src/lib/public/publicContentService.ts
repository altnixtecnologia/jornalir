import { EDITORIAL_PLACEMENT_LIMITS } from "@ir/types";
import { getPublicSupabaseClient } from "./supabasePublicClient";
import type { PublicArticle, PublicArticleMedia, PublicLocality, PublicPlacementType, PublicSection } from "./types";

interface SectionRow {
  id: string;
  slug: string;
  name: string;
}
interface LocalityRow {
  id: string;
  slug: string;
  name: string;
  scope: string;
}
interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  body: string;
  section_id: string;
  locality_id: string;
  urgent: boolean;
  published_at: string;
}
interface MediaRow {
  article_id: string;
  media_id: string;
  role: "cover" | "gallery";
  sort_order: number;
  url: string;
  alt_text: string | null;
  caption: string | null;
  credit: string | null;
}
interface PlacementRow {
  article_id: string;
  type: PublicPlacementType;
  pinned: boolean;
  pinned_rank: number | null;
  created_at: string;
}

function mediaRowToDomain(row: MediaRow): PublicArticleMedia {
  return {
    mediaId: row.media_id,
    role: row.role,
    order: row.sort_order,
    url: row.url,
    altText: row.alt_text ?? undefined,
    caption: row.caption ?? undefined,
    credit: row.credit ?? undefined,
  };
}

/**
 * Só a capa (uma consulta `.in()` para todos os artigos de uma vez) —
 * suficiente para listagens/home; a galeria completa só é buscada na
 * página de matéria (mesmo princípio de `fetchCoverMediaByArticle` do
 * painel, Fase 26).
 */
async function fetchCoverByArticle(articleIds: string[]): Promise<Map<string, PublicArticleMedia>> {
  const map = new Map<string, PublicArticleMedia>();
  if (articleIds.length === 0) return map;
  const client = getPublicSupabaseClient();
  const { data, error } = await client
    .from("public_article_media")
    .select("article_id, media_id, role, sort_order, url, alt_text, caption, credit")
    .in("article_id", articleIds)
    .eq("role", "cover");
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as MediaRow[]) {
    map.set(row.article_id, mediaRowToDomain(row));
  }
  return map;
}

export async function listPublicSections(): Promise<PublicSection[]> {
  const client = getPublicSupabaseClient();
  const { data, error } = await client.from("public_editorial_sections").select("id, slug, name");
  if (error) throw new Error(error.message);
  return (data ?? []) as SectionRow[];
}

export async function listPublicLocalities(): Promise<PublicLocality[]> {
  const client = getPublicSupabaseClient();
  const { data, error } = await client.from("public_localities").select("id, slug, name, scope");
  if (error) throw new Error(error.message);
  return (data ?? []) as LocalityRow[];
}

function buildArticles(
  rows: ArticleRow[],
  sectionById: Map<string, PublicSection>,
  localityById: Map<string, PublicLocality>,
  coverByArticle: Map<string, PublicArticleMedia>,
): PublicArticle[] {
  return rows.map((row) => {
    // Abrangência "geral" nunca aparece nos metadados públicos (Fase 49,
    // item 2) — é o valor neutro/padrão do legado, não uma informação
    // real para o leitor. Só abrangências informativas (cidade/estado/
    // país/região) são mostradas.
    const locality = localityById.get(row.locality_id);
    const localityName = locality && locality.scope !== "general" ? locality.name : "";
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle ?? undefined,
      body: row.body,
      sectionId: row.section_id,
      sectionName: sectionById.get(row.section_id)?.name ?? "Geral",
      sectionSlug: sectionById.get(row.section_id)?.slug ?? "",
      localityId: row.locality_id,
      localityName,
      urgent: row.urgent,
      publishedAt: row.published_at,
      cover: coverByArticle.get(row.id),
      gallery: [],
    };
  });
}

/**
 * Listagem pequena (home, "Leia também") — mais recentes primeiro, só
 * capa. Mantida como estava (Fase 39 mexeu só em quem precisava do
 * acervo inteiro) — nunca usar isto para páginas que precisam alcançar
 * todo o acervo (mais de 4 mil matérias já migradas do legado); para
 * isso, usar `listPublicArticlesPage`.
 */
export async function listPublicArticles(options?: { limit?: number; sectionId?: string }): Promise<PublicArticle[]> {
  const client = getPublicSupabaseClient();
  let query = client
    .from("public_articles")
    .select("id, slug, title, subtitle, body, section_id, locality_id, urgent, published_at")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false });
  if (options?.sectionId) query = query.eq("section_id", options.sectionId);
  if (options?.limit) query = query.limit(options.limit);

  const [{ data, error }, sections, localities] = await Promise.all([
    query,
    listPublicSections(),
    listPublicLocalities(),
  ]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ArticleRow[];
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const localityById = new Map(localities.map((l) => [l.id, l]));
  const coverByArticle = await fetchCoverByArticle(rows.map((r) => r.id));
  return buildArticles(rows, sectionById, localityById, coverByArticle);
}

export interface PagedArticles {
  items: PublicArticle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Um termo de busca vai dentro de um filtro `.or(...)` do PostgREST, cuja
 * sintaxe usa vírgula/parênteses como separadores estruturais — e `%`/`_`
 * são curingas do `ilike`. Sem tratar isso, um termo com vírgula quebra o
 * filtro inteiro (silenciosamente teria efeito diferente do esperado) e
 * `%`/`_` viram curinga em vez de caractere literal buscado.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[,()]/g, " ")
    .replace(/[%_]/g, (match) => `\\${match}`)
    .trim();
}

/**
 * Listagem paginada real (item 1-4 da correção do portal, Fase 39) — nunca
 * carrega o acervo inteiro no servidor nem no navegador. `count: "exact"`
 * dá o total real (não uma estimativa) para mostrar "X de Y" e calcular o
 * número de páginas. Ordem sempre `published_at DESC` com desempate por
 * `id DESC` (estável mesmo com published_at empatado, ex.: vários itens
 * do legado importados no mesmo minuto) — nunca `created_at` (faria
 * conteúdo do legado, inserido agora, parecer "recém-publicado").
 */
export async function listPublicArticlesPage(options: {
  page?: number;
  pageSize?: number;
  sectionId?: string;
  query?: string;
}): Promise<PagedArticles> {
  const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize ?? 24)));
  const client = getPublicSupabaseClient();
  const term = options.query ? sanitizeSearchTerm(options.query) : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo exato do builder do supabase-js muda conforme .select()/.eq()/.or() encadeados; aqui só aplicamos os mesmos dois filtros opcionais em duas queries com formatos de retorno diferentes (count vs. dados).
  const applyFilters = (q: any) => {
    let query = q;
    if (options.sectionId) query = query.eq("section_id", options.sectionId);
    if (term) query = query.or(`title.ilike.%${term}%,subtitle.ilike.%${term}%,body.ilike.%${term}%`);
    return query;
  };

  // Conta primeiro (query leve, `head: true` não traz linhas) para poder
  // limitar `page` ao total real ANTES de pedir o `.range()` — pedir uma
  // página além do fim faz o PostgREST responder "Requested range not
  // satisfiable" (erro real encontrado ao testar `?page=999`, Fase 39),
  // e uma paginação real nunca pode quebrar só porque alguém navegou (ou
  // um link antigo aponta) para além da última página.
  const [{ count, error: countError }, sections, localities] = await Promise.all([
    applyFilters(client.from("public_articles").select("id", { count: "exact", head: true })),
    listPublicSections(),
    listPublicLocalities(),
  ]);
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), totalPages);

  if (total === 0) {
    return { items: [], total: 0, page: 1, pageSize, totalPages: 1 };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const dataQuery = applyFilters(
    client
      .from("public_articles")
      .select("id, slug, title, subtitle, body, section_id, locality_id, urgent, published_at"),
  )
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const { data, error } = await dataQuery;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ArticleRow[];
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const localityById = new Map(localities.map((l) => [l.id, l]));
  const coverByArticle = await fetchCoverByArticle(rows.map((r) => r.id));
  const items = buildArticles(rows, sectionById, localityById, coverByArticle);

  return { items, total, page, pageSize, totalPages };
}

/** Página de matéria — capa + galeria completa, na ordem correta. */
export async function getPublicArticleBySlug(slug: string): Promise<PublicArticle | null> {
  const client = getPublicSupabaseClient();
  const [{ data, error }, sections, localities] = await Promise.all([
    client
      .from("public_articles")
      .select("id, slug, title, subtitle, body, section_id, locality_id, urgent, published_at")
      .eq("slug", slug)
      .maybeSingle(),
    listPublicSections(),
    listPublicLocalities(),
  ]);
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as ArticleRow;

  const { data: mediaData, error: mediaError } = await client
    .from("public_article_media")
    .select("article_id, media_id, role, sort_order, url, alt_text, caption, credit")
    .eq("article_id", row.id)
    .order("role", { ascending: false })
    .order("sort_order", { ascending: true });
  if (mediaError) throw new Error(mediaError.message);
  const media = ((mediaData ?? []) as MediaRow[]).map(mediaRowToDomain);

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const localityById = new Map(localities.map((l) => [l.id, l]));
  const [article] = buildArticles([row], sectionById, localityById, new Map());
  return {
    ...article,
    cover: media.find((item) => item.role === "cover"),
    gallery: media.filter((item) => item.role === "gallery"),
  };
}

/**
 * Matérias efetivamente em destaque agora numa posição (Fase 30, item 6) —
 * já filtradas pela view (`published` + `active` + dentro da janela); só
 * falta aplicar o corte 8/3/7/4 e a ordem (fixadas por `pinnedRank`,
 * demais por recência), mesma regra de `ArticleService.listActivePlacement`
 * (packages/core), replicada aqui porque o portal não consome esse
 * pacote (mock/real desde sempre desacoplados — ver diagnóstico da Fase 22).
 */
export async function listPublicPlacement(type: PublicPlacementType): Promise<PublicArticle[]> {
  const client = getPublicSupabaseClient();
  const { data, error } = await client
    .from("public_article_placements")
    .select("article_id, type, pinned, pinned_rank, created_at")
    .eq("type", type);
  if (error) throw new Error(error.message);
  const placements = (data ?? []) as PlacementRow[];
  if (placements.length === 0) return [];

  const placementByArticle = new Map(placements.map((p) => [p.article_id, p]));
  const articleIds = placements.map((p) => p.article_id);

  const [{ data: articleData, error: articleError }, sections, localities] = await Promise.all([
    client
      .from("public_articles")
      .select("id, slug, title, subtitle, body, section_id, locality_id, urgent, published_at")
      .in("id", articleIds),
    listPublicSections(),
    listPublicLocalities(),
  ]);
  if (articleError) throw new Error(articleError.message);
  const rows = (articleData ?? []) as ArticleRow[];
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const localityById = new Map(localities.map((l) => [l.id, l]));
  const coverByArticle = await fetchCoverByArticle(rows.map((r) => r.id));
  const articles = buildArticles(rows, sectionById, localityById, coverByArticle);

  const pinned = articles
    .filter((article) => placementByArticle.get(article.id)?.pinned)
    .sort((a, b) => {
      const rankA = placementByArticle.get(a.id)?.pinned_rank;
      const rankB = placementByArticle.get(b.id)?.pinned_rank;
      if (rankA !== null && rankA !== undefined && rankB !== null && rankB !== undefined) return rankA - rankB;
      if (rankA !== null && rankA !== undefined) return -1;
      if (rankB !== null && rankB !== undefined) return 1;
      return 0;
    });
  const unpinned = articles
    .filter((article) => !placementByArticle.get(article.id)?.pinned)
    .sort((a, b) => (placementByArticle.get(b.id)?.created_at ?? "").localeCompare(placementByArticle.get(a.id)?.created_at ?? ""));

  const limit = EDITORIAL_PLACEMENT_LIMITS[type];
  return [...pinned, ...unpinned].slice(0, limit);
}

/** Fisher-Yates — nunca muta a lista recebida. */
function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * "Leia também" real (Fase 30, item 9): mistura relevância simples (até
 * metade das vagas prioriza a mesma editoria, quando houver opções
 * suficientes) com variedade (resto embaralhado entre as demais) — sem
 * algoritmo complexo. Nunca a matéria atual, nunca repetida.
 */
export async function getReadAlso(current: PublicArticle, count = 4): Promise<PublicArticle[]> {
  const pool = (await listPublicArticles({ limit: 60 })).filter((article) => article.id !== current.id);
  const sameSection = shuffle(pool.filter((article) => article.sectionId === current.sectionId));
  const other = shuffle(pool.filter((article) => article.sectionId !== current.sectionId));

  const fromSameSection = sameSection.slice(0, Math.ceil(count / 2));
  const remainingSlots = count - fromSameSection.length;
  const fromOther = other.slice(0, remainingSlots);
  const combined = fromSameSection.length + fromOther.length < count
    ? [...fromSameSection, ...fromOther, ...sameSection.slice(fromSameSection.length)].slice(0, count)
    : [...fromSameSection, ...fromOther];

  return shuffle(combined);
}
