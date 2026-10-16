import Link from "next/link";
import type { CommercialSaleFinancialStatus, CommercialSaleStatus } from "@ir/types";
import { COMMERCIAL_SALE_STATUS_LABELS, COMMERCIAL_SALE_STATUSES, deriveCommercialSaleFinancialStatus } from "@ir/types";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { PaginatedNav } from "../../../../features/editorial/PaginatedNav";
import { ReceivablePageSizeSelect } from "../../../../features/financeiro/ReceivablePageSizeSelect";
import { CommercialSalesList } from "../../../../features/comercial/CommercialSalesList";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { listCommercialSalesAdminPageSupabase } from "../../../../providers/supabase/commercialSaleRepository.supabase";
import { listReceivablesForCommercialSalesSupabase } from "../../../../providers/supabase/receivableRepository.supabase";

const FILTERS_FORM_ID = "vendas-filtros";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Listagem de vendas comerciais (item 21) — filtros reais (busca/
 * status/período), "Por página" junto da tabela (reaproveita
 * ReceivablePageSizeSelect/PaginatedNav do Financeiro, nenhum
 * componente novo pra isso), paginação real (count/range), ordenação
 * fixa (created_at desc) sem seta clicável. Situação financeira sempre
 * DERIVADA dos receivables vinculados, nunca um campo próprio gravado.
 */
export default async function CommercialSalesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const q = one(searchParams?.q).trim();
  const status = one(searchParams?.status);
  const startFrom = one(searchParams?.startFrom);
  const startTo = one(searchParams?.startTo);
  const page = Math.max(1, Number(one(searchParams?.page)) || 1);
  const pageSize = Number(one(searchParams?.pageSize)) || 25;

  const result = await listCommercialSalesAdminPageSupabase(supabase, {
    page,
    pageSize,
    search: q,
    status: COMMERCIAL_SALE_STATUSES.includes(status as CommercialSaleStatus) ? (status as CommercialSaleStatus) : undefined,
    startFrom: startFrom || undefined,
    startTo: startTo || undefined,
  });

  const receivables = await listReceivablesForCommercialSalesSupabase(supabase, result.sales.map((sale) => sale.id));
  const receivablesBySale = new Map<string, typeof receivables>();
  for (const receivable of receivables) {
    if (!receivable.commercialSaleId) continue;
    const list = receivablesBySale.get(receivable.commercialSaleId) ?? [];
    list.push(receivable);
    receivablesBySale.set(receivable.commercialSaleId, list);
  }
  const financialStatusBySaleId = new Map<string, CommercialSaleFinancialStatus>(
    result.sales.map((sale) => [sale.id, deriveCommercialSaleFinancialStatus(receivablesBySale.get(sale.id) ?? [])]),
  );

  return (
    <>
      <ModuleHeader
        eyebrow="PUBLICIDADE / VENDAS"
        title="Vendas"
        description="Publicidade contratada, valor, período e situação financeira."
        action={
          <Link className="form-action-primary" href="/sistema/publicidade/vendas/novo">
            + Nova venda
          </Link>
        }
      />

      <form id={FILTERS_FORM_ID} className="materias-toolbar" method="get" action="/sistema/publicidade/vendas">
        <div className="materias-filters">
          <label className="materias-search">
            Buscar
            <input name="q" type="search" defaultValue={q} placeholder="Cliente, referência, descrição ou canal" />
          </label>
          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="">Todos</option>
              {COMMERCIAL_SALE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {COMMERCIAL_SALE_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início de
            <input type="date" name="startFrom" defaultValue={startFrom} />
          </label>
          <label>
            Início até
            <input type="date" name="startTo" defaultValue={startTo} />
          </label>
          <button type="submit" className="cadastros-btn-primary">Buscar</button>
          <Link className="secondary-link" href="/sistema/publicidade/vendas">Limpar</Link>
        </div>
      </form>

      <div className="cadastros-table-controls">
        <span className="materias-count">
          Página {result.page} de {result.totalPages} · {result.total} venda(s)
        </span>
        <Link
          className="secondary-link"
          href={`/sistema/publicidade/vendas/imprimir?${new URLSearchParams({
            ...(q ? { q } : {}),
            ...(status ? { status } : {}),
            ...(startFrom ? { startFrom } : {}),
            ...(startTo ? { startTo } : {}),
          }).toString()}`}
        >
          Imprimir relatório
        </Link>
        <ReceivablePageSizeSelect formId={FILTERS_FORM_ID} value={result.pageSize} />
      </div>

      <CommercialSalesList sales={result.sales} financialStatusBySaleId={financialStatusBySaleId} />

      <div className="cadastros-table-controls">
        <PaginatedNav
          basePath="/sistema/publicidade/vendas"
          page={result.page}
          totalPages={result.totalPages}
          params={{
            ...(q ? { q } : {}),
            ...(status ? { status } : {}),
            ...(startFrom ? { startFrom } : {}),
            ...(startTo ? { startTo } : {}),
            pageSize: String(result.pageSize),
          }}
        />
      </div>
    </>
  );
}
