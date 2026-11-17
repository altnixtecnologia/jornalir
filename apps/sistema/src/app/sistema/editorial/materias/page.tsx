import Link from "next/link";
import type { ArticleOrigin, ArticleStatus } from "@ir/types";
import { EditorialSummaryCards } from "../../../../features/editorial/EditorialSummaryCards";
import { EditionArticleGroups } from "../../../../features/editorial/EditionArticleGroups";
import { pickRecentEditionIds } from "../../../../features/editorial/recentEditionGroups";
import { getEditorialArticleStats } from "../../../../features/editorial/editorialArticleStats";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { MateriasList, type MateriasListFilters } from "../../../../features/editorial/MateriasList";
import {
  getEditorialSectionService,
  getLocalityService,
  getNewspaperEditionService,
} from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  listArticlesAdminPageSupabase,
  type MateriasDateField,
  type MateriasSortColumn,
  type SortDirection,
} from "../../../../providers/supabase/articleRepository.supabase";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function asStatus(value: string): ArticleStatus | "all" | "unpublished" {
  if (value === "unpublished") return "unpublished";
  return ["draft", "adjusting", "scheduled", "published", "archived"].includes(value)
    ? (value as ArticleStatus)
    : "all";
}

function asOrigin(value: string): ArticleOrigin | "all" {
  return ["manual", "pdfImport", "legacySite"].includes(value)
    ? (value as ArticleOrigin)
    : "all";
}

const SORT_COLUMNS: MateriasSortColumn[] = [
  "reference",
  "title",
  "origin",
  "section",
  "locality",
  "status",
  "date",
  "notification",
];

function asSortColumn(value: string): MateriasSortColumn {
  return (SORT_COLUMNS as string[]).includes(value) ? (value as MateriasSortColumn) : "date";
}

function asSortDir(value: string): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

function asDateField(value: string): MateriasDateField | undefined {
  return value === "published" || value === "scheduled" || value === "editorial" ? value : undefined;
}

function asDateOnly(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function asEditionId(value: string): string {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : "all";
}

// Explícito (searchParams já tornaria dinâmico por padrão) para deixar
// claro que esta listagem nunca pode ser servida do Full Route Cache —
// qualquer mutação em uma matéria (destaque, status, fixação etc.) deve
// refletir aqui na primeira renderização seguinte, sem depender de cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MateriasPage(
  props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
): Promise<JSX.Element> {
  const searchParams = await props.searchParams;
  const supabase = createSupabaseServerClient();
  const filters: MateriasListFilters = {
    q: one(searchParams?.q).trim(),
    status: asStatus(one(searchParams?.status)),
    sectionId: one(searchParams?.section) || "all",
    localityId: one(searchParams?.locality) || "all",
    origin: asOrigin(one(searchParams?.origin)),
    editionId: asEditionId(one(searchParams?.edition)),
    includeArchived: one(searchParams?.includeArchived) === "1",
    sortBy: asSortColumn(one(searchParams?.sortBy)),
    sortDir: asSortDir(one(searchParams?.sortDir)),
    dateField: asDateField(one(searchParams?.dateField)),
    dateFrom: asDateOnly(one(searchParams?.dateFrom)),
    dateTo: asDateOnly(one(searchParams?.dateTo)),
  };
  const requestedPage = Math.max(1, Number(one(searchParams?.page)) || 1);
  const requestedPageSize = Number(one(searchParams?.pageSize)) || 48;

  // A visão inicial usa apenas matérias ligadas a edições; o acervo legado
  // continua disponível em "Todas as matérias" e nunca é recarregado em massa.
  const listKeys = ["q", "status", "section", "locality", "origin", "edition", "sortBy", "sortDir",
    "dateField", "dateFrom", "dateTo", "page", "pageSize", "includeArchived"];
  const hasListQuery = listKeys.some((key) => Boolean(one(searchParams?.[key])));
  const groupedView = one(searchParams?.view) !== "all" && !hasListQuery;

  const [editions, stats] = await Promise.all([
    getNewspaperEditionService(supabase).list(),
    getEditorialArticleStats(supabase),
  ]);

  let articlePage: Awaited<ReturnType<typeof listArticlesAdminPageSupabase>> | null = null;
  let sections: Awaited<ReturnType<ReturnType<typeof getEditorialSectionService>["list"]>> = [];
  let localities: Awaited<ReturnType<ReturnType<typeof getLocalityService>["list"]>> = [];
  let editionGroups: { edition: (typeof editions)[number]; articles: Awaited<ReturnType<typeof listArticlesAdminPageSupabase>>["articles"]; total: number }[] = [];

  if (groupedView) {
    // Consulta apenas IDs já vinculados, não os ~23 mil artigos históricos sem edição.
    // O limite protege o banco; as demais edições permanecem acessíveis pelo filtro.
    const { data: linkedRows, error: linkedError } = await supabase.from("articles")
      .select("newspaper_edition_id")
      .not("newspaper_edition_id", "is", null)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(600);
    if (linkedError) throw new Error(linkedError.message);
    const editionIds = pickRecentEditionIds(linkedRows ?? [], editions, 6);
    const mapped = new Map(editions.map((edition) => [edition.id, edition]));
    editionGroups = (await Promise.all(editionIds.map(async (id) => {
      const edition = mapped.get(id);
      if (!edition) return null;
      const result = await listArticlesAdminPageSupabase(supabase, {
        editionId: id, page: 1, pageSize: 96, sortBy: "reference", sortDir: "asc",
      });
      return result.articles.length > 0 ? { edition, articles: result.articles, total: result.total } : null;
    }))).filter((group): group is NonNullable<typeof group> => group !== null);
  } else {
    [articlePage, sections, localities] = await Promise.all([
      listArticlesAdminPageSupabase(supabase, {
        page: requestedPage,
        pageSize: requestedPageSize,
        search: filters.q,
        status: filters.status,
        sectionId: filters.sectionId,
        localityId: filters.localityId,
        origin: filters.origin,
        editionId: filters.editionId === "all" ? undefined : filters.editionId,
        includeArchived: filters.includeArchived,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        dateField: filters.dateField,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      }),
      getEditorialSectionService(supabase).list(),
      getLocalityService(supabase).list(),
    ]);
  }

  return (
    <div className="materias-mobile-page">
      <ModuleHeader
        eyebrow="EDITORIAL / MATÉRIAS"
        title="Matérias"
        description="Gerencie as matérias por edição ou consulte o acervo completo pelos filtros."
        action={
          <Link className="header-action" href="/sistema/editorial/materias/nova">
            + Nova matéria
          </Link>
        }
      />
      <EditorialSummaryCards stats={stats} />
      <nav className="editorial-edition-nav" aria-label="Visualização de matérias">
        <h2>{groupedView ? "Matérias agrupadas por edição" : "Todas as matérias"}</h2>
        <Link href={groupedView ? "/sistema/editorial/materias?view=all" : "/sistema/editorial/materias"}
          className="secondary-link">
          {groupedView ? "Ver todas e filtrar" : "Ver agrupadas por edição"}
        </Link>
      </nav>
      {groupedView ? (
        <EditionArticleGroups groups={editionGroups} />
      ) : articlePage ? (
        <MateriasList
          articles={articlePage.articles}
          sections={sections}
          localities={localities}
          editions={editions}
          total={articlePage.total}
          page={articlePage.page}
          pageSize={articlePage.pageSize}
          totalPages={articlePage.totalPages}
          filters={filters}
        />
      ) : null}
    </div>
  );
}
