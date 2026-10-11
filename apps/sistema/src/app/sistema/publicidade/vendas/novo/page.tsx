import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { CommercialSaleForm } from "../../../../../features/comercial/CommercialSaleForm";
import { getCommercialProductService } from "../../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewCommercialSalePage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const products = await getCommercialProductService(supabase).list({ activeOnly: true });

  return (
    <>
      <ModuleHeader eyebrow="PUBLICIDADE / VENDAS" title="Nova venda" description="Cliente, publicidade contratada, valor e período." />
      <CommercialSaleForm products={products} />
    </>
  );
}
