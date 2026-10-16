import Link from "next/link";
import type { ReceivableSourceType, ReceivableStatus } from "@ir/types";
import { RECEIVABLE_SOURCE_TYPE_LABELS, RECEIVABLE_SOURCE_TYPES, RECEIVABLE_STATUS_LABELS, RECEIVABLE_STATUSES } from "@ir/types";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { PaginatedNav } from "../../../../features/editorial/PaginatedNav";
import { ReceivablesList } from "../../../../features/financeiro/ReceivablesList";
import { ReceivablePageSizeSelect } from "../../../../features/financeiro/ReceivablePageSizeSelect";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { listReceivablesAdminPageSupabase } from "../../../../providers/supabase/receivableRepository.supabase";

const FILTERS_FORM_ID = "contas-a-receber-filtros";

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
  const withBalanceOnly = one(searchParams?.withBalance) === "1";
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
    withBalanceOnly,
  });

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / CONTAS A RECEBER"
        title="Contas a receber"
        description="Títulos, recebimentos parciais e situação de cada cliente."
        action={
          <Link className="form-action-primary" href="/sistema/financeiro/contas-a-receber/novo">
            + Novo lançamento
          </Link>
        }
      />

      <form id={FILTERS_FORM_ID} className="materias-toolbar" method="get" action="/sistema/financeiro/contas-a-receber">
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
          {withBalanceOnly ? <input type="hidden" name="withBalance" value="1" /> : null}
          <button type="submit" className="cadastros-btn-primary">Buscar</button>
          <Link className="secondary-link" href="/sistema/financeiro/contas-a-receber">Limpar</Link>
        </div>
      </form>

      <div className="cadastros-table-controls">
        <span className="materias-count">
          Página {result.page} de {result.totalPages} · {result.total} título(s)
        </span>
        <ReceivablePageSizeSelect formId={FILTERS_FORM_ID} value={result.pageSize} />
      </div>

      <ReceivablesList receivables={result.receivables} />

      <div className="cadastros-table-controls">
        <PaginatedNav
          basePath="/sistema/financeiro/contas-a-receber"
          page={result.page}
          totalPages={result.totalPages}
          params={{
            ...(q ? { q } : {}),
            ...(status ? { status } : {}),
            ...(sourceType ? { sourceType } : {}),
            ...(dueFrom ? { dueFrom } : {}),
            ...(dueTo ? { dueTo } : {}),
            ...(withBalanceOnly ? { withBalance: "1" } : {}),
            pageSize: String(result.pageSize),
          }}
        />
      </div>
    </>
  );
}
