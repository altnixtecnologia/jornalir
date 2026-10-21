import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { LocalidadesManager } from "../../../../features/editorial/LocalidadesManager";
import { getLocalityService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export default async function LocalidadesPage(): Promise<JSX.Element> {
  const localities = await getLocalityService(createSupabaseServerClient()).list();

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / ABRANGÊNCIAS"
        title="Abrangências"
        description="Cadastre cidades, estados e coberturas amplas. Escolha a UF quando necessário."
      />
      <LocalidadesManager localities={localities} />
    </>
  );
}
