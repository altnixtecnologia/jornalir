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
import { listArticlesAdminPageSupabase } from "../../../../providers/supabase/articleRepository.supabase";

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
