import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { CommercialProductsPanel } from "../../../../features/comercial/CommercialProductsPanel";
import { getCommercialProductService } from "../../../../composition/comercial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CommercialProductsPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const products = await getCommercialProductService(supabase).list();

  return (
    <>
      <ModuleHeader
        eyebrow="PUBLICIDADE / PRODUTOS"
        title="Produtos/canais"
        description="Evita digitar canal e preço sugerido do zero em cada venda."
      />
      <CommercialProductsPanel products={products} />
    </>
  );
}
