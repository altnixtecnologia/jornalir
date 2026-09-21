import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { LocalidadesManager } from "../../../../features/editorial/LocalidadesManager";
import { getLocalityService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export default async function LocalidadesPage(): Promise<JSX.Element> {
  const localities = await getLocalityService(createSupabaseServerClient()).list();

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / LOCALIDADES"
        title="Localidades"
        description="Cidade, região ou abrangência geral — sempre independente da editoria."
      />
      <LocalidadesManager localities={localities} />
    </>
  );
}
