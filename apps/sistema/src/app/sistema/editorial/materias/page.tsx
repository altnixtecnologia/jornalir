import Link from "next/link";
import type { ArticleOrigin, ArticleStatus } from "@ir/types";
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

function asStatus(value: string): ArticleStatus | "all" {
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

// Explícito (searchParams já tornaria dinâmico por padrão) para deixar
// claro que esta listagem nunca pode ser servida do Full Route Cache —
// qualquer mutação em uma matéria (destaque, status, fixação etc.) deve
// refletir aqui na primeira renderização seguinte, sem depender de cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MateriasPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const filters: MateriasListFilters = {
    q: one(searchParams?.q).trim(),
    status: asStatus(one(searchParams?.status)),
    sectionId: one(searchParams?.section) || "all",
    localityId: one(searchParams?.locality) || "all",
    origin: asOrigin(one(searchParams?.origin)),
    sortBy: asSortColumn(one(searchParams?.sortBy)),
    sortDir: asSortDir(one(searchParams?.sortDir)),
    dateField: asDateField(one(searchParams?.dateField)),
    dateFrom: asDateOnly(one(searchParams?.dateFrom)),
    dateTo: asDateOnly(one(searchParams?.dateTo)),
  };
  const requestedPage = Math.max(1, Number(one(searchParams?.page)) || 1);
  const requestedPageSize = Number(one(searchParams?.pageSize)) || 48;

  const [articlePage, sections, localities, editions] = await Promise.all([
    listArticlesAdminPageSupabase(supabase, {
      page: requestedPage,
      pageSize: requestedPageSize,
      search: filters.q,
      status: filters.status,
      sectionId: filters.sectionId,
      localityId: filters.localityId,
      origin: filters.origin,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
      dateField: filters.dateField,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    }),
    getEditorialSectionService(supabase).list(),
    getLocalityService(supabase).list(),
    getNewspaperEditionService(supabase).list(),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / MATÉRIAS"
        title="Matérias"
        description="Listagem paginada no banco para continuar rápida mesmo com todo o acervo histórico carregado."
        action={
          <Link className="header-action" href="/sistema/editorial/materias/nova">
            Nova matéria <span aria-hidden="true">＋</span>
          </Link>
        }
      />
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
    </>
  );
}
