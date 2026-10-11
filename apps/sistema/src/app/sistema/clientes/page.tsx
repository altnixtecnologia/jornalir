import Link from "next/link";
import { CLIENT_ROLES, CLIENT_ROLE_LABELS } from "@ir/types";
import { PaginatedNav } from "../../../features/editorial/PaginatedNav";
import { ClientesList } from "../../../features/clientes/ClientesList";
import { CadastroPageSizeSelect } from "../../../features/clientes/CadastroPageSizeSelect";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { listClientsAdminPageSupabase } from "../../../providers/supabase/clientRepository.supabase";

const FILTERS_FORM_ID = "cadastros-filtros";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const q = one(searchParams?.q).trim();
  const kind = one(searchParams?.kind);
  const status = one(searchParams?.status);
  const page = Math.max(1, Number(one(searchParams?.page)) || 1);
  const pageSize = Number(one(searchParams?.pageSize)) || 25;

  const result = await listClientsAdminPageSupabase(supabase, {
    page,
    pageSize,
    search: q,
    kind: kind === "individual" || kind === "company" ? kind : undefined,
    status: status === "active" || status === "inactive" ? status : undefined,
  });

  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.page * result.pageSize, result.total);

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
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        <label className="cadastros-search">
          <span className="sr-only">Buscar</span>
          <input name="q" type="search" defaultValue={q} placeholder="Nome, razão social, CPF/CNPJ, telefone ou e-mail" />
        </label>
        {/* Papel ainda não filtra de verdade: a consulta (listClientsAdminPageSupabase)
            não suporta filtro por papel hoje, e aplicar isso só na página já
            carregada produziria contagem/paginação erradas (resultado enganoso).
            Visual preparado agora; a lógica real depende de ajuste no provider,
            fora do escopo desta tarefa. */}
        <select aria-label="Papel" title="Filtragem por papel: em breve" disabled defaultValue="">
          <option value="">Papel: todos</option>
          {CLIENT_ROLES.map((role) => (
            <option key={role} value={role}>
              {CLIENT_ROLE_LABELS[role]}
            </option>
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

      <ClientesList clients={result.clients} />

      <div className="cadastros-table-controls">
        <PaginatedNav
          basePath="/sistema/clientes"
          page={result.page}
          totalPages={result.totalPages}
          params={{
            ...(q ? { q } : {}),
            ...(kind ? { kind } : {}),
            ...(status ? { status } : {}),
            pageSize: String(result.pageSize),
          }}
        />
      </div>
    </>
  );
}
