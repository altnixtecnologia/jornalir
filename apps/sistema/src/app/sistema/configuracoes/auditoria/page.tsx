import Link from "next/link";
import { redirect } from "next/navigation";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { PaginatedNav } from "../../../../features/editorial/PaginatedNav";
import { AuditEventsTable } from "../../../../features/auditoria/AuditEventsTable";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  listAuditEventsAdminPageSupabase,
  type AuditEventOrigin,
  type AuditEventResult,
  type AuditEventSortField,
} from "../../../../providers/supabase/auditEvents.supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_PATH = "/sistema/configuracoes/auditoria";
const SORT_FIELDS: AuditEventSortField[] = ["created_at", "entity_type", "action"];
const SORT_LABELS: Record<AuditEventSortField, string> = {
  created_at: "Data e hora",
  entity_type: "Módulo",
  action: "Acontecimento",
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function sortHeaderLink(
  field: AuditEventSortField,
  currentSort: AuditEventSortField,
  currentDir: "asc" | "desc",
  params: Record<string, string>,
): JSX.Element {
  const nextDir = currentSort === field && currentDir === "desc" ? "asc" : "desc";
  const search = new URLSearchParams({ ...params, sortBy: field, sortDir: nextDir, page: "1" });
  const isActive = currentSort === field;
  return (
    <Link href={`${BASE_PATH}?${search.toString()}`} className={`audit-sort-link${isActive ? " is-active" : ""}`}>
      {SORT_LABELS[field]}
      {isActive ? <span aria-hidden="true">{currentDir === "asc" ? " ▲" : " ▼"}</span> : null}
    </Link>
  );
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const client = createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("active,role").eq("id", user.id).maybeSingle();
  if (!profile?.active || !["owner", "admin"].includes(profile.role)) redirect("/sistema");

  const q = one(searchParams?.q).trim();
  const entityType = one(searchParams?.entityType);
  const action = one(searchParams?.action);
  const origin = one(searchParams?.origin);
  const result = one(searchParams?.result);
  const dateFrom = one(searchParams?.dateFrom);
  const dateTo = one(searchParams?.dateTo);
  const page = Math.max(1, Number(one(searchParams?.page)) || 1);
  const sortBy = (SORT_FIELDS as string[]).includes(one(searchParams?.sortBy))
    ? (one(searchParams?.sortBy) as AuditEventSortField)
    : "created_at";
  const sortDir = one(searchParams?.sortDir) === "asc" ? "asc" : "desc";

  const pageResult = await listAuditEventsAdminPageSupabase(client, {
    page,
    search: q,
    entityType: entityType || undefined,
    action: action || undefined,
    origin: (origin === "user" || origin === "automatic" ? origin : undefined) as AuditEventOrigin | undefined,
    result: (["success", "failed", "skipped"].includes(result) ? result : undefined) as AuditEventResult | undefined,
    dateFrom: dateFrom ? `${dateFrom}T00:00:00` : undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
    sortBy,
    sortDir,
  });

  const activeParams: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
    ...(origin ? { origin } : {}),
    ...(result ? { result } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    sortBy,
    sortDir,
  };

  return (
    <>
      <ModuleHeader
        eyebrow="CONFIGURAÇÕES / AUDITORIA"
        title="Auditoria e Atividades"
        description="Histórico permanente de ações administrativas — matérias, usuários, publicidade, financeiro, fiscal, aplicativo e automações do JoIR."
      />

      <form className="materias-toolbar" method="get" action={BASE_PATH}>
        <div className="materias-filters">
          <label className="materias-search">
            Buscar
            <input name="q" type="search" defaultValue={q} placeholder="Ação, módulo, título..." />
          </label>
          <label>
            Módulo (entidade)
            <input name="entityType" type="text" defaultValue={entityType} placeholder="ex.: articles" />
          </label>
          <label>
            Tipo de operação
            <input name="action" type="text" defaultValue={action} placeholder="ex.: publish" />
          </label>
          <label>
            Origem
            <select name="origin" defaultValue={origin}>
              <option value="">Todas</option>
              <option value="user">Usuário</option>
              <option value="automatic">Automática (sistema/JoIR)</option>
            </select>
          </label>
          <label>
            Resultado
            <select name="result" defaultValue={result}>
              <option value="">Todos</option>
              <option value="success">Sucesso</option>
              <option value="failed">Falha</option>
              <option value="skipped">Ignorado</option>
            </select>
          </label>
          <label>
            Período de
            <input type="date" name="dateFrom" defaultValue={dateFrom} />
          </label>
          <label>
            até
            <input type="date" name="dateTo" defaultValue={dateTo} />
          </label>
          <input type="hidden" name="sortBy" value={sortBy} />
          <input type="hidden" name="sortDir" value={sortDir} />
          <button type="submit" className="cadastros-btn-primary">Buscar</button>
          <Link className="secondary-link" href={BASE_PATH}>Limpar filtros</Link>
        </div>
      </form>

      <div className="cadastros-table-controls">
        <span className="materias-count">
          Página {pageResult.page} de {pageResult.totalPages} · {pageResult.total} evento(s)
        </span>
      </div>

      <div className="audit-sort-bar" aria-label="Ordenar por">
        Ordenar por:{" "}
        {SORT_FIELDS.map((field, index) => (
          <span key={field}>
            {index > 0 ? " · " : " "}
            {sortHeaderLink(field, sortBy, sortDir, activeParams)}
          </span>
        ))}
      </div>

      <AuditEventsTable rows={pageResult.items} />

      <div className="cadastros-table-controls">
        <PaginatedNav
          basePath={BASE_PATH}
          page={pageResult.page}
          totalPages={pageResult.totalPages}
          params={activeParams}
        />
      </div>
    </>
  );
}
