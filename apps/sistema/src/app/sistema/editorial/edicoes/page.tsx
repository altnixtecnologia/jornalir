import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { EdicoesManager } from "../../../../features/editorial/EdicoesManager";
import { getNewspaperEditionService } from "../../../../composition/editorial";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

// Arquivar/reaproveitar um PDF agora encadeia a extração automática de
// matérias (ver edicoes/actions.ts) antes de responder ao operador — o
// limite padrão de função do Vercel (bem menor que isto em planos sem
// configuração) poderia interromper o encadeamento no meio para uma edição
// grande. 60s é seguro tanto no plano Hobby quanto no Pro sem configuração
// extra; aumentar aqui (Pro aceita até 300s/800s) se uma edição real exigir.
export const maxDuration = 60;

export default async function EdicoesPage(): Promise<JSX.Element> {
  const editions = await getNewspaperEditionService(createSupabaseServerClient()).list();

  return (
    <>
      <ModuleHeader
        eyebrow="EDITORIAL / EDIÇÕES"
        title="Edições do jornal"
        description="Cadastro das edições impressas. O PDF oficial e a capa ficam no Cloudflare R2; o Supabase guarda somente os metadados e as referências do arquivo."
      />
      <EdicoesManager editions={editions} />
    </>
  );
}
