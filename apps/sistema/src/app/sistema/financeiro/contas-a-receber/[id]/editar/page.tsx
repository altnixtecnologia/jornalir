import { notFound } from "next/navigation";
import { ReceivableNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../../components/admin/ModuleHeader";
import { ReceivableForm } from "../../../../../../features/financeiro/ReceivableForm";
import { getContractService, getReceivableService } from "../../../../../../composition/financeiro";
import { getClientService } from "../../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

export default async function EditarLancamentoPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const receivable = await getReceivableService(supabase)
    .getById(params.id)
    .catch((error: unknown) => {
      if (error instanceof ReceivableNotFoundError) return null;
      throw error;
    });
  if (!receivable) notFound();

  const [clients, contracts] = await Promise.all([
    getClientService(supabase).list(),
    getContractService(supabase).list(),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow={`FINANCEIRO / CONTAS A RECEBER / ${receivable.reference}`}
        title={`Editar ${receivable.description}`}
        description="Dados do lançamento, valores, vencimento e contrato relacionado."
      />
      <ReceivableForm mode="edit" receivable={receivable} clients={clients} contracts={contracts} />
    </>
  );
}
