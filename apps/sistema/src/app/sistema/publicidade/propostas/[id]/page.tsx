import { notFound } from "next/navigation";
import { CommercialProposalNotFoundError } from "@ir/core";
import { clientDisplayName } from "@ir/types";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { CommercialProposalDetail } from "../../../../../features/comercial/CommercialProposalDetail";
import { toClientSearchResult } from "../../../../../components/admin/clientSearchTypes";
import { getCommercialProductService, getCommercialProposalService } from "../../../../../composition/comercial";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CommercialProposalDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const proposal = await getCommercialProposalService(supabase)
    .getWithItems(params.id)
    .catch((error: unknown) => {
      if (error instanceof CommercialProposalNotFoundError) return null;
      throw error;
    });
  if (!proposal) notFound();

  const [client, products] = await Promise.all([
    getClientService(supabase).getById(proposal.clientId),
    getCommercialProductService(supabase).list({ activeOnly: true }),
  ]);
  const clientSearchResult = toClientSearchResult(client);

  return (
    <>
      <ModuleHeader eyebrow={`COMERCIAL / PROPOSTAS / ${proposal.reference}`} title={clientDisplayName(client)} description={`Proposta de ${new Date(`${proposal.proposalDate}T00:00:00`).toLocaleDateString("pt-BR")}`} />
      <CommercialProposalDetail proposal={proposal} clientName={clientDisplayName(client)} products={products} client={clientSearchResult} />
    </>
  );
}
