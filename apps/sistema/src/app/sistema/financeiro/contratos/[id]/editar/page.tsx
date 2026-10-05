import { notFound } from "next/navigation";
import { ContractNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../../components/admin/ModuleHeader";
import { ContractForm } from "../../../../../../features/financeiro/ContractForm";
import { getContractService } from "../../../../../../composition/financeiro";
import { getClientService } from "../../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

export default async function EditarContratoPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const contract = await getContractService(supabase)
    .getById(params.id)
    .catch((error: unknown) => {
      if (error instanceof ContractNotFoundError) return null;
      throw error;
    });
  if (!contract) notFound();

  const clients = await getClientService(supabase).list();

  return (
    <>
      <ModuleHeader
        eyebrow={`FINANCEIRO / CONTRATOS / ${contract.reference}`}
        title="Editar contrato institucional"
        description="Revise os dados — inclusive os que vieram de uma extração automática de documento, quando existir."
      />
      <ContractForm mode="edit" contract={contract} clients={clients} />
    </>
  );
}
