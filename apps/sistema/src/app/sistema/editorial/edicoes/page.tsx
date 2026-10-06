import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { EdicoesManager } from "../../../../features/editorial/EdicoesManager";
import { getNewspaperEditionService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export default async function EdicoesPage(): Promise<JSX.Element> {
  const editions = await getNewspaperEditionService(createSupabaseServerClient()).list();

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / EDIÇÕES"
        title="Edições do jornal"
        description="Cadastro das edições impressas. O PDF oficial fica no Google Drive do Jornal Online; o Supabase guarda apenas os dados e a referência do arquivo."
      />
      <EdicoesManager editions={editions} />
    </>
  );
}
