import { notFound } from "next/navigation";
import { clientDisplayName, deriveCommercialSaleFinancialStatus } from "@ir/types";
import { CommercialSaleNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { CommercialSaleDetail } from "../../../../../features/comercial/CommercialSaleDetail";
import { getCommercialProductService, getCommercialProposalService, getCommercialSaleService } from "../../../../../composition/comercial";
import { getClientService } from "../../../../../composition/clientes";
import { getDraftService } from "../../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { listReceivablesForCommercialSalesSupabase } from "../../../../../providers/supabase/receivableRepository.supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CommercialSaleDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const sale = await getCommercialSaleService(supabase)
    .getById(params.id)
    .catch((error: unknown) => {
      if (error instanceof CommercialSaleNotFoundError) return null;
      throw error;
    });
  if (!sale) notFound();

  const [client, products, receivables, nfseDraft, proposal] = await Promise.all([
    getClientService(supabase).getById(sale.clientId),
    getCommercialProductService(supabase).list({ activeOnly: true }),
    listReceivablesForCommercialSalesSupabase(supabase, [sale.id]),
    getDraftService(supabase).getByOrigin("jornal_ir", "commercial_sale", sale.id),
    sale.proposalId ? getCommercialProposalService(supabase).getById(sale.proposalId).catch(() => null) : Promise.resolve(null),
  ]);

  const financialStatus = deriveCommercialSaleFinancialStatus(receivables);

  return (
    <>
      <ModuleHeader eyebrow={`COMERCIAL / VENDAS / ${sale.reference}`} title={clientDisplayName(client)} description={`${sale.channel} — ${sale.description}`} />
      <CommercialSaleDetail
        sale={sale}
        clientName={clientDisplayName(client)}
        products={products}
        receivables={receivables}
        financialStatus={financialStatus}
        nfseDraft={nfseDraft}
        proposal={proposal}
      />
    </>
  );
}
