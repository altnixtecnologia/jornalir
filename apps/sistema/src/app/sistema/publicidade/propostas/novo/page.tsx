import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { CommercialProposalForm } from "../../../../../features/comercial/CommercialProposalForm";
import { getCommercialProductService } from "../../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewCommercialProposalPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const products = await getCommercialProductService(supabase).list({ activeOnly: true });

  return (
    <>
      <ModuleHeader eyebrow="COMERCIAL / PROPOSTAS" title="Nova proposta" description="Cliente, itens, validade e condição comercial." />
      <CommercialProposalForm mode="create" products={products} />
    </>
  );
}
