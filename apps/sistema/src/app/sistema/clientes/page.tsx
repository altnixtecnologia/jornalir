import Link from "next/link";
import { CLIENT_ROLES, CLIENT_ROLE_LABELS, type ClientRole } from "@ir/types";
import { PaginatedNav } from "../../../features/editorial/PaginatedNav";
import { ClientesList } from "../../../features/clientes/ClientesList";
import { CadastroPageSizeSelect } from "../../../features/clientes/CadastroPageSizeSelect";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { listClientsAdminPageSupabase, type ClientAdminSortKey } from "../../../providers/supabase/clientRepository.supabase";

const FILTERS_FORM_ID = "cadastros-filtros";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ClientesPage(
  props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
): Promise<JSX.Element> {
  const searchParams = await props.searchParams;
  const supabase = createSupabaseServerClient();
  const q = one(searchParams?.q).trim();
  const kind = one(searchParams?.kind);
  const status = one(searchParams?.status);
  const roleRaw = one(searchParams?.role);
  const role = CLIENT_ROLES.includes(roleRaw as ClientRole) ? roleRaw as ClientRole : undefined;
  const sortByRaw = one(searchParams?.sortBy);
  const sortBy = (["reference","name","document","status"] as string[]).includes(sortByRaw)
    ? sortByRaw as ClientAdminSortKey : undefined;
  const sortDir = one(searchParams?.sortDir) === "desc" ? "desc" as const : "asc" as const;
  const page = Math.max(1, Number(one(searchParams?.page)) || 1);
  const pageSize = Number(one(searchParams?.pageSize)) || 25;

  const result = await listClientsAdminPageSupabase(supabase, {
    page,
    pageSize,
    search: q,
    kind: kind === "individual" || kind === "company" ? kind : undefined,
    status: status === "active" || status === "inactive" ? status : undefined,
    role, sortBy, sortDir,
  });

  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.page * result.pageSize, result.total);
  const sortHref = (column: ClientAdminSortKey): string => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (kind) params.set("kind", kind);
    if (status) params.set("status", status);
    if (role) params.set("role", role);
    params.set("pageSize", String(result.pageSize));
    params.set("sortBy", column);
    params.set("sortDir", sortBy === column && sortDir === "asc" ? "desc" : "asc");
    return `/sistema/clientes?${params.toString()}`;
  };
  const sortHrefs: Record<ClientAdminSortKey, string> = {
    reference: sortHref("reference"), name: sortHref("name"),
    document: sortHref("document"), status: sortHref("status"),
  };

  return (
    <>
      <header className="cadastros-header">
        <div>
          <p className="eyebrow">CADASTROS</p>
          <h1>Cadastros</h1>
          <p className="cadastros-header-desc">
            Cadastro central de pessoas e empresas — base para assinaturas, financeiro e publicidade.
          </p>
        </div>
        <Link className="cadastros-btn-primary" href="/sistema/clientes/novo">
          + Novo cadastro
        </Link>
      </header>

      <form id={FILTERS_FORM_ID} className="cadastros-filters-bar" method="get" action="/sistema/clientes">
        {sortBy ? <input type="hidden" name="sortBy" value={sortBy} /> : null}
        {sortBy ? <input type="hidden" name="sortDir" value={sortDir} /> : null}
        <select name="kind" defaultValue={kind} aria-label="Tipo de pessoa">
          <option value="">Pessoa: todas</option>
          <option value="individual">Pessoa física</option>
          <option value="company">Pessoa jurídica</option>
        </select>
        <label className="cadastros-search">
          <span className="sr-only">Buscar</span>
          <input name="q" type="search" defaultValue={q} placeholder="Nome, razão social, CPF/CNPJ, telefone ou e-mail" />
        </label>
        <select name="role" aria-label="Papel" defaultValue={role ?? ""}>
          <option value="">Papel: todos</option>
          {CLIENT_ROLES.map((item) => (
            <option key={item} value={item}>{CLIENT_ROLE_LABELS[item]}</option>
          ))}
        </select>
        <select name="status" defaultValue={status} aria-label="Status" title="Status">
          <option value="">Status: todos</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
        <div className="cadastros-filters-actions">
          <button type="submit" className="cadastros-btn-primary">
            Buscar
          </button>
          <Link className="cadastros-btn-secondary" href="/sistema/clientes">
            Limpar
          </Link>
        </div>
      </form>

      <div className="cadastros-table-controls">
        <span className="cadastros-count">
          {result.total === 0 ? "Nenhum cadastro encontrado" : `Mostrando ${from}–${to} de ${result.total}`}
        </span>
        <CadastroPageSizeSelect formId={FILTERS_FORM_ID} value={result.pageSize} />
      </div>

      <ClientesList clients={result.clients} sortHrefs={sortHrefs} sortBy={sortBy} sortDir={sortDir} />

      <div className="cadastros-table-controls">
        <PaginatedNav
          basePath="/sistema/clientes"
          page={result.page}
          totalPages={result.totalPages}
          params={{
            ...(q ? { q } : {}),
            ...(kind ? { kind } : {}),
            ...(status ? { status } : {}),
            ...(role ? { role } : {}),
            ...(sortBy ? { sortBy, sortDir } : {}),
            pageSize: String(result.pageSize),
          }}
        />
      </div>
    </>
  );
}
