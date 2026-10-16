import Link from "next/link";
import type { SubscriptionServiceType, SubscriptionStatus } from "@ir/types";
import { SUBSCRIPTION_SERVICE_TYPE_LABELS, SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_SERVICE_TYPES, SUBSCRIPTION_STATUSES } from "@ir/types";
import { ModuleHeader } from "../../../components/admin/ModuleHeader";
import { PaginatedNav } from "../../../features/editorial/PaginatedNav";
import { SubscriptionsList } from "../../../features/assinaturas/SubscriptionsList";
import { SubscriptionPageSizeSelect } from "../../../features/assinaturas/SubscriptionPageSizeSelect";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { listSubscriptionsAdminPageSupabase } from "../../../providers/supabase/subscriptionRepository.supabase";

const FILTERS_FORM_ID = "assinaturas-filtros";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

// Explícito (searchParams já tornaria dinâmico por padrão) — mesma
// convenção da listagem de Matérias: nunca servir do Full Route Cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AssinaturasPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const q = one(searchParams?.q).trim();
  const serviceType = one(searchParams?.serviceType);
  const status = one(searchParams?.status);
  const page = Math.max(1, Number(one(searchParams?.page)) || 1);
  const pageSize = Number(one(searchParams?.pageSize)) || 25;

  const result = await listSubscriptionsAdminPageSupabase(supabase, {
    page,
    pageSize,
    search: q,
    serviceType: SUBSCRIPTION_SERVICE_TYPES.includes(serviceType as SubscriptionServiceType)
      ? (serviceType as SubscriptionServiceType)
      : undefined,
    status: SUBSCRIPTION_STATUSES.includes(status as SubscriptionStatus) ? (status as SubscriptionStatus) : undefined,
  });

  return (
    <>
      <ModuleHeader
        eyebrow="ASSINATURAS"
        title="Assinaturas"
        description="Serviços (impresso, digital, TV) vinculados a um cliente — um mesmo cliente pode ter mais de uma assinatura."
        action={
          <Link className="form-action-primary" href="/sistema/assinaturas/nova">
            + Nova assinatura
          </Link>
        }
      />

      <form id={FILTERS_FORM_ID} className="materias-toolbar" method="get" action="/sistema/assinaturas">
        <div className="materias-filters">
          <label className="materias-search">
            Buscar
            <input name="q" type="search" defaultValue={q} placeholder="Referência, nome/razão social, CPF ou CNPJ" />
          </label>
          <label>
            Serviço
            <select name="serviceType" defaultValue={serviceType}>
              <option value="">Todos</option>
              {SUBSCRIPTION_SERVICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SUBSCRIPTION_SERVICE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="">Todos</option>
              {SUBSCRIPTION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {SUBSCRIPTION_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="cadastros-btn-primary">Buscar</button>
          <Link className="secondary-link" href="/sistema/assinaturas">Limpar</Link>
        </div>
      </form>

      <div className="cadastros-table-controls">
        <span className="materias-count">
          Página {result.page} de {result.totalPages} · {result.total} assinatura(s)
        </span>
        <SubscriptionPageSizeSelect formId={FILTERS_FORM_ID} value={result.pageSize} />
      </div>

      <SubscriptionsList subscriptions={result.subscriptions} />

      <div className="cadastros-table-controls">
        <PaginatedNav
          basePath="/sistema/assinaturas"
          page={result.page}
          totalPages={result.totalPages}
          params={{
            ...(q ? { q } : {}),
            ...(serviceType ? { serviceType } : {}),
            ...(status ? { status } : {}),
            pageSize: String(result.pageSize),
          }}
        />
      </div>
    </>
  );
}
