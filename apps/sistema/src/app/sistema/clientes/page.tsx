import Link from "next/link";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { PaginationControls } from "../../../features/editorial/PaginationControls";
import { ClientesList } from "../../../features/clientes/ClientesList";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { listClientsAdminPageSupabase } from "../../../providers/supabase/clientRepository.supabase";

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

  function href(targetPage: number): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (kind) params.set("kind", kind);
    if (status) params.set("status", status);
    params.set("page", String(targetPage));
    params.set("pageSize", String(result.pageSize));
    return `/sistema/clientes?${params.toString()}`;
  }

  return (
    <>
      <ModuleHeader
        eyebrow="CLIENTES"
        title="Clientes"
        description="Cadastro central de pessoas e empresas — base para assinaturas, financeiro e publicidade."
        action={
          <Link className="form-action-primary" href="/sistema/clientes/novo">
            Novo cliente
          </Link>
        }
      />

      <form className="materias-toolbar" method="get" action="/sistema/clientes">
        <div className="materias-filters">
          <label className="materias-search">
            Buscar
            <input name="q" type="search" defaultValue={q} placeholder="Nome, razão social, CPF/CNPJ, telefone ou e-mail" />
          </label>
          <label>
            Tipo
            <select name="kind" defaultValue={kind}>
              <option value="">Todos</option>
              <option value="individual">Pessoa física</option>
              <option value="company">Pessoa jurídica</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="">Todos</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>
          <label>
            Por página
            <select name="pageSize" defaultValue={String(result.pageSize)}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
          <button type="submit">Buscar</button>
          <Link className="secondary-link" href="/sistema/clientes">Limpar</Link>
        </div>
        <span className="materias-count">
          Página {result.page} de {result.totalPages} · {result.total} cliente(s)
        </span>
      </form>

      <ClientesList clients={result.clients} />

      <PaginationControls page={result.page} totalPages={result.totalPages} buildHref={href} />
    </>
  );
}
