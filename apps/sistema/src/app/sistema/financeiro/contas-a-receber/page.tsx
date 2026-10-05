import Link from "next/link";
import type { ReceivableSourceType, ReceivableStatus } from "@ir/types";
import { RECEIVABLE_SOURCE_TYPE_LABELS, RECEIVABLE_SOURCE_TYPES, RECEIVABLE_STATUS_LABELS, RECEIVABLE_STATUSES } from "@ir/types";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { PaginationControls } from "../../../../features/editorial/PaginationControls";
import { ReceivablesList } from "../../../../features/financeiro/ReceivablesList";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { listReceivablesAdminPageSupabase } from "../../../../providers/supabase/receivableRepository.supabase";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContasAReceberPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const q = one(searchParams?.q).trim();
  const status = one(searchParams?.status);
  const sourceType = one(searchParams?.sourceType);
  const dueFrom = one(searchParams?.dueFrom);
  const dueTo = one(searchParams?.dueTo);
  const page = Math.max(1, Number(one(searchParams?.page)) || 1);
  const pageSize = Number(one(searchParams?.pageSize)) || 25;

  const result = await listReceivablesAdminPageSupabase(supabase, {
    page,
    pageSize,
    search: q,
    status: RECEIVABLE_STATUSES.includes(status as ReceivableStatus) ? (status as ReceivableStatus) : undefined,
    sourceType: RECEIVABLE_SOURCE_TYPES.includes(sourceType as ReceivableSourceType) ? (sourceType as ReceivableSourceType) : undefined,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
  });

  function href(targetPage: number): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (sourceType) params.set("sourceType", sourceType);
    if (dueFrom) params.set("dueFrom", dueFrom);
    if (dueTo) params.set("dueTo", dueTo);
    params.set("page", String(targetPage));
    params.set("pageSize", String(result.pageSize));
    return `/sistema/financeiro/contas-a-receber?${params.toString()}`;
  }

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / CONTAS A RECEBER"
        title="Contas a receber"
        description="Títulos, recebimentos parciais e situação de cada cliente."
        action={
          <Link className="form-action-primary" href="/sistema/financeiro/contas-a-receber/novo">
            Novo lançamento
          </Link>
        }
      />

      <form className="materias-toolbar" method="get" action="/sistema/financeiro/contas-a-receber">
        <div className="materias-filters">
          <label className="materias-search">
            Buscar
            <input name="q" type="search" defaultValue={q} placeholder="Cliente, CPF/CNPJ, descrição ou referência" />
          </label>
          <label>
            Situação
            <select name="status" defaultValue={status}>
              <option value="">Todas</option>
              {RECEIVABLE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {RECEIVABLE_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origem
            <select name="sourceType" defaultValue={sourceType}>
              <option value="">Todas</option>
              {RECEIVABLE_SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RECEIVABLE_SOURCE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vencimento de
            <input type="date" name="dueFrom" defaultValue={dueFrom} />
          </label>
          <label>
            Vencimento até
            <input type="date" name="dueTo" defaultValue={dueTo} />
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
          <Link className="secondary-link" href="/sistema/financeiro/contas-a-receber">Limpar</Link>
        </div>
        <span className="materias-count">
          Página {result.page} de {result.totalPages} · {result.total} título(s)
        </span>
      </form>

      <ReceivablesList receivables={result.receivables} />

      <PaginationControls page={result.page} totalPages={result.totalPages} buildHref={href} />
    </>
  );
}
