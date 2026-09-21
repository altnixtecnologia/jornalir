import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Article,
  ArticleOrigin,
  ArticleStatus,
  EditorialPlacement,
  EditorialPlacementType,
  EditorialTextStyle,
  NotificationMode,
} from "@ir/types";
import type {
  ArticleChanges,
  ArticleFilters,
  ArticleRepository,
  NewArticleRecord,
} from "@ir/core";

const ARTICLES_TABLE = "articles";
const PLACEMENTS_TABLE = "article_placements";

const ARTICLE_COLUMNS =
  "id, internal_reference, slug, title, title_style, subtitle, subtitle_style, body, section_id, locality_id, status, notification_mode, origin, newspaper_edition_id, newspaper_page, urgent, scheduled_at, published_at, archived_at, created_by, created_at, updated_at";

interface ArticleRow {
  id: string;
  internal_reference: string;
  slug: string;
  title: string;
  title_style: EditorialTextStyle | null;
  subtitle: string | null;
  subtitle_style: EditorialTextStyle | null;
  body: string;
  section_id: string;
  locality_id: string;
  status: ArticleStatus;
  notification_mode: NotificationMode;
  origin: "manual" | "pdf";
  newspaper_edition_id: string | null;
  newspaper_page: number | null;
  urgent: boolean;
  scheduled_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PlacementRow {
  id: string;
  article_id: string;
  type: EditorialPlacementType;
  starts_at: string | null;
  ends_at: string | null;
  pinned: boolean;
  active: boolean;
  created_at: string;
}

const ORIGIN_TO_DOMAIN: Record<ArticleRow["origin"], ArticleOrigin> = {
  manual: "manual",
  pdf: "pdfImport",
};
const ORIGIN_TO_DB: Record<ArticleOrigin, ArticleRow["origin"]> = {
  manual: "manual",
  pdfImport: "pdf",
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Slug é gerado só na criação, a partir do título — nunca regenerado numa
 * edição posterior (mudar o slug de uma matéria já publicada quebraria a
 * URL). Unicidade garantida tentando sufixos `-2`, `-3`... contra o banco
 * (mais simples e confiável que reservar/depender de extensão `unaccent`
 * no Postgres, que este projeto não tem instalada).
 */
async function generateUniqueSlug(client: SupabaseClient, title: string): Promise<string> {
  const base = slugify(title) || "materia";
  let candidate = base;
  let attempt = 1;
  // Loop finito na prática (nº de títulos idênticos é sempre pequeno); sem
  // limite artificial porque nunca há entrada de usuário não confiável aqui.
  for (;;) {
    const { data, error } = await client.from(ARTICLES_TABLE).select("id").eq("slug", candidate).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

function placementToDomain(row: PlacementRow | null): EditorialPlacement {
  if (!row) return { type: "none" };
  return {
    type: row.type,
    pinned: row.type === "mainCover" ? row.pinned : undefined,
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    setAt: row.created_at,
  };
}

function toDomain(row: ArticleRow, placement: PlacementRow | null): Article {
  return {
    id: row.id,
    reference: row.internal_reference,
    title: row.title,
    titleStyle: row.title_style ?? undefined,
    subtitle: row.subtitle ?? undefined,
    subtitleStyle: row.subtitle_style ?? undefined,
    body: row.body,
    sectionId: row.section_id,
    localityId: row.locality_id,
    status: row.status,
    placement: placementToDomain(placement),
    urgent: row.urgent,
    notificationMode: row.notification_mode,
    // Media Provider ainda não migrado (Fase 26) — matéria real nunca
    // recebe mídia mock injetada; vínculos reais de article_media, se
    // algum dia existirem, só passam a ser lidos quando essa fase chegar.
    media: [],
    origin: ORIGIN_TO_DOMAIN[row.origin],
    editionId: row.newspaper_edition_id ?? undefined,
    editionPageNumber: row.newspaper_page ?? undefined,
    publishedAt: row.published_at ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? "",
  };
}

async function fetchActivePlacements(
  client: SupabaseClient,
  articleIds: string[],
): Promise<Map<string, PlacementRow>> {
  const map = new Map<string, PlacementRow>();
  if (articleIds.length === 0) return map;
  const { data, error } = await client
    .from(PLACEMENTS_TABLE)
    .select("id, article_id, type, starts_at, ends_at, pinned, active, created_at")
    .in("article_id", articleIds)
    .eq("active", true);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as PlacementRow[]) {
    map.set(row.article_id, row);
  }
  return map;
}

async function fetchActivePlacement(client: SupabaseClient, articleId: string): Promise<PlacementRow | null> {
  const { data, error } = await client
    .from(PLACEMENTS_TABLE)
    .select("id, article_id, type, starts_at, ends_at, pinned, active, created_at")
    .eq("article_id", articleId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PlacementRow | null) ?? null;
}

/**
 * Encerra a linha ativa atual (se houver) e, quando o novo destino não é
 * "none", garante a linha certa em `article_placements` — nunca duas ativas
 * ao mesmo tempo (reforçado também por índice único parcial no banco).
 *
 * Regras (Fase 25, item 6):
 * - `none`: só encerra a linha ativa atual (ends_at=now, active=false).
 *   Nunca cria uma linha "none".
 * - destino diferente do atual: encerra a atual (se houver) e cria uma
 *   linha nova — preserva o histórico.
 * - mesmo destino (só pinned/janela mudou): atualiza a linha ativa atual
 *   no lugar — não cria histórico a cada clique.
 *
 * `starts_at` nunca fica antes de `scheduledAt` quando a matéria está
 * sendo agendada — uma matéria agendada para o futuro não pode disputar
 * vaga hoje (Fase 25, item 8): o gatilho `enforce_placement_limit` só
 * conta/expulsa quando a matéria já está `published`, então isso é reforço
 * de coerência, não a única barreira.
 */
async function syncPlacement(
  client: SupabaseClient,
  articleId: string,
  next: EditorialPlacement,
  effectiveStatus: ArticleStatus,
  scheduledAt: string | null | undefined,
): Promise<void> {
  const current = await fetchActivePlacement(client, articleId);

  let startsAt = next.startsAt ?? null;
  if (effectiveStatus === "scheduled" && scheduledAt) {
    startsAt = startsAt && startsAt > scheduledAt ? startsAt : scheduledAt;
  }

  if (next.type === "none") {
    if (current) {
      const { error } = await client
        .from(PLACEMENTS_TABLE)
        .update({ active: false, ends_at: new Date().toISOString() })
        .eq("id", current.id);
      if (error) throw new Error(error.message);
    }
    return;
  }

  if (!current || current.type !== next.type) {
    if (current) {
      const { error: closeError } = await client
        .from(PLACEMENTS_TABLE)
        .update({ active: false, ends_at: new Date().toISOString() })
        .eq("id", current.id);
      if (closeError) throw new Error(closeError.message);
    }
    const { error: insertError } = await client.from(PLACEMENTS_TABLE).insert({
      article_id: articleId,
      type: next.type,
      pinned: next.type === "mainCover" ? (next.pinned ?? false) : false,
      starts_at: startsAt,
      ends_at: next.endsAt ?? null,
      active: true,
    });
    if (insertError) throw new Error(insertError.message);
    return;
  }

  const { error } = await client
    .from(PLACEMENTS_TABLE)
    .update({
      pinned: next.type === "mainCover" ? (next.pinned ?? false) : false,
      starts_at: startsAt,
      ends_at: next.endsAt ?? null,
    })
    .eq("id", current.id);
  if (error) throw new Error(error.message);
}

/**
 * Reafirma a linha ativa atual (mesmos valores, sem mudar destino) — força
 * o trigger `enforce_placement_limit` a reavaliar a disputa com o status
 * novo da matéria (ex.: acabou de ser publicada agora). Sem isso, publicar
 * uma matéria com destino já escolhido em rascunho nunca faria a linha
 * disputar vaga de verdade, porque o trigger só roda em INSERT/UPDATE de
 * `article_placements`, nunca por causa de um UPDATE em `articles`.
 */
async function touchActivePlacement(client: SupabaseClient, articleId: string): Promise<void> {
  const current = await fetchActivePlacement(client, articleId);
  if (!current) return;
  const { error } = await client.from(PLACEMENTS_TABLE).update({ active: true }).eq("id", current.id);
  if (error) throw new Error(error.message);
}

async function closeActivePlacement(client: SupabaseClient, articleId: string): Promise<void> {
  const current = await fetchActivePlacement(client, articleId);
  if (!current) return;
  const { error } = await client
    .from(PLACEMENTS_TABLE)
    .update({ active: false, ends_at: new Date().toISOString() })
    .eq("id", current.id);
  if (error) throw new Error(error.message);
}

export function createArticleRepositorySupabase(client: SupabaseClient): ArticleRepository {
  return {
    async list(filters?: ArticleFilters) {
      let query = client.from(ARTICLES_TABLE).select(ARTICLE_COLUMNS).order("updated_at", { ascending: false });
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.sectionId) query = query.eq("section_id", filters.sectionId);
      if (filters?.localityId) query = query.eq("locality_id", filters.localityId);
      if (filters?.editionId) query = query.eq("newspaper_edition_id", filters.editionId);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as ArticleRow[];

      const placements = await fetchActivePlacements(client, rows.map((row) => row.id));

      const articles = rows.map((row) => toDomain(row, placements.get(row.id) ?? null));
      if (filters?.placementType) {
        return articles.filter((article) => article.placement.type === filters.placementType);
      }
      return articles;
    },

    async getById(id: string) {
      const { data, error } = await client.from(ARTICLES_TABLE).select(ARTICLE_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const row = data as ArticleRow;
      const placement = await fetchActivePlacement(client, row.id);
      return toDomain(row, placement);
    },

    async create(record: NewArticleRecord) {
      const slug = await generateUniqueSlug(client, record.title);
      const { data, error } = await client
        .from(ARTICLES_TABLE)
        .insert({
          slug,
          title: record.title,
          title_style: record.titleStyle ?? null,
          subtitle: record.subtitle ?? null,
          subtitle_style: record.subtitleStyle ?? null,
          body: record.body,
          section_id: record.sectionId,
          locality_id: record.localityId,
          status: record.status,
          notification_mode: record.notificationMode,
          origin: ORIGIN_TO_DB[record.origin],
          newspaper_edition_id: record.editionId ?? null,
          newspaper_page: record.editionPageNumber ?? null,
          urgent: record.urgent,
          // created_by/updated_by: nunca enviados — trigger `set_article_actor`
          // (Fase 25) sempre usa auth.uid() da sessão, ignora qualquer valor daqui.
        })
        .select(ARTICLE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      const row = data as ArticleRow;

      if (record.placement.type !== "none") {
        await syncPlacement(client, row.id, record.placement, row.status, row.scheduled_at);
      }

      const placement = await fetchActivePlacement(client, row.id);
      return toDomain(row, placement);
    },

    async update(id: string, changes: ArticleChanges) {
      const patch: Record<string, unknown> = {};
      if (changes.title !== undefined) patch.title = changes.title;
      if (changes.titleStyle !== undefined) patch.title_style = changes.titleStyle ?? null;
      if (changes.subtitle !== undefined) patch.subtitle = changes.subtitle ?? null;
      if (changes.subtitleStyle !== undefined) patch.subtitle_style = changes.subtitleStyle ?? null;
      if (changes.body !== undefined) patch.body = changes.body;
      if (changes.sectionId !== undefined) patch.section_id = changes.sectionId;
      if (changes.localityId !== undefined) patch.locality_id = changes.localityId;
      if (changes.status !== undefined) patch.status = changes.status;
      if (changes.notificationMode !== undefined) patch.notification_mode = changes.notificationMode;
      if (changes.urgent !== undefined) patch.urgent = changes.urgent;
      if (changes.editionPageNumber !== undefined) patch.newspaper_page = changes.editionPageNumber ?? null;
      if (changes.scheduledAt !== undefined) patch.scheduled_at = changes.scheduledAt ?? null;
      if (changes.publishedAt !== undefined) patch.published_at = changes.publishedAt ?? null;
      if (changes.status === "archived") patch.archived_at = new Date().toISOString();
      // media: Media Provider ainda mock (Fase 26) — nunca escreve em
      // article_media aqui; qualquer `changes.media` enviado é ignorado
      // para não fingir que um upload foi persistido.

      const { data, error } =
        Object.keys(patch).length > 0
          ? await client.from(ARTICLES_TABLE).update(patch).eq("id", id).select(ARTICLE_COLUMNS).single()
          : await client.from(ARTICLES_TABLE).select(ARTICLE_COLUMNS).eq("id", id).single();
      if (error) throw new Error(error.message);
      const row = data as ArticleRow;

      if (changes.placement) {
        await syncPlacement(client, id, changes.placement, row.status, row.scheduled_at);
      } else if (changes.status === "archived") {
        await closeActivePlacement(client, id);
      } else if (changes.status === "published") {
        await touchActivePlacement(client, id);
      }

      const placement = await fetchActivePlacement(client, id);
      return toDomain(row, placement);
    },
  };
}
