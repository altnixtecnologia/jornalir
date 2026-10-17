import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { getContractTemplateService } from "../../../../composition/financeiro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { ContractTemplatesManager } from "../../../../features/financeiro/ContractTemplatesManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Modelos de contrato e geração automática de PDF (Item 5, Lote 3).
 * Lista só a versão ATUAL de cada modelo — histórico completo fica
 * disponível por modelo ("Histórico de versões").
 */
export default async function ContractTemplatesPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const templates = await getContractTemplateService(supabase).listCurrentVersions();

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / MODELOS DE CONTRATO"
        title="Modelos de contrato"
        description="Gerencie modelos para geração automática de contratos — nunca substitui o upload manual de PDF."
      />
      <ContractTemplatesManager templates={templates} />
    </>
  );
}
