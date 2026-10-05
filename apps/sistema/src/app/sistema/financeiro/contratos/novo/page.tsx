import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ContractIntakeWizard } from "../../../../../features/financeiro/ContractIntakeWizard";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function NovoContratoPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const clients = await getClientService(supabase).list();
  const initialClientId = one(searchParams?.clientId) || undefined;

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / CONTRATOS INSTITUCIONAIS / NOVO"
        title="Novo contrato institucional"
        description="Fluxo orientado pelo documento: anexar, conferir o que foi encontrado, completar e revisar antes de salvar."
      />
      <ContractIntakeWizard clients={clients} initialClientId={initialClientId} />
    </>
  );
}
