import Link from "next/link";
import type { CommercialProposalStatus } from "@ir/types";
import { COMMERCIAL_PROPOSAL_STATUS_LABELS, COMMERCIAL_PROPOSAL_STATUSES } from "@ir/types";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { CommercialProposalsList } from "../../../../features/comercial/CommercialProposalsList";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { listCommercialProposalsWithTotalsSupabase } from "../../../../providers/supabase/commercialProposalRepository.supabase";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CommercialProposalsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const q = one(searchParams?.q).trim();
  const status = one(searchParams?.status);

  const proposals = await listCommercialProposalsWithTotalsSupabase(supabase, {
    search: q || undefined,
    status: COMMERCIAL_PROPOSAL_STATUSES.includes(status as CommercialProposalStatus) ? (status as CommercialProposalStatus) : undefined,
  });

  return (
    <>
      <ModuleHeader
        eyebrow="COMERCIAL / PROPOSTAS"
        title="Propostas/Orçamentos"
        description="Documentos pré-venda — podem ser aprovados e convertidos em venda, ou recusados/arquivados."
        action={
          <Link className="form-action-primary" href="/sistema/publicidade/propostas/novo">
            + Nova proposta
          </Link>
        }
      />

      <form className="materias-toolbar" method="get" action="/sistema/publicidade/propostas">
        <div className="materias-filters">
          <label className="materias-search">
            Buscar
            <input name="q" type="search" defaultValue={q} placeholder="Referência ou observações" />
          </label>
          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="">Todos</option>
              {COMMERCIAL_PROPOSAL_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {COMMERCIAL_PROPOSAL_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="cadastros-btn-primary">Buscar</button>
          <Link className="secondary-link" href="/sistema/publicidade/propostas">Limpar</Link>
        </div>
      </form>

      <p className="materias-count">{proposals.length} proposta(s)</p>

      <CommercialProposalsList proposals={proposals} />
    </>
  );
}
