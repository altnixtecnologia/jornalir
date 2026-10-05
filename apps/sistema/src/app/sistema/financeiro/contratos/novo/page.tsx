import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ContractIntakeWizard } from "../../../../../features/financeiro/ContractIntakeWizard";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export default async function NovoContratoPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const clients = await getClientService(supabase).list();

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / CONTRATOS INSTITUCIONAIS / NOVO"
        title="Novo contrato institucional"
        description="Fluxo orientado pelo documento: anexar, conferir o que foi encontrado, completar e revisar antes de salvar."
      />
      <ContractIntakeWizard clients={clients} />
    </>
  );
}
