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
        description="Cadastro das edições impressas — número, data e PDF oficial. Usadas pela Importação de PDF e pelo vínculo edição/página das matérias."
      />
      <EdicoesManager editions={editions} />
    </>
  );
}
