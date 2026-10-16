import { notFound } from "next/navigation";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ReceivableForm } from "../../../../../features/financeiro/ReceivableForm";
import { getContractService } from "../../../../../composition/financeiro";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { financePermissionError } from "../../../../../lib/permissions/serverFinanceGuard";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function NovoLancamentoPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  if (await financePermissionError("titulos_criar")) notFound();
  const supabase = createSupabaseServerClient();
  const [clients, contracts] = await Promise.all([
    getClientService(supabase).list(),
    getContractService(supabase).list(),
  ]);
  const initialClientId = one(searchParams?.clientId) || undefined;
  const initialContractId = one(searchParams?.contractId) || undefined;

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / CONTAS A RECEBER / NOVO"
        title="Novo lançamento"
        description="Cadastre um título (assinatura, publicidade, contrato institucional ou avulso)."
      />
      <ReceivableForm mode="create" clients={clients} contracts={contracts} initialClientId={initialClientId} initialContractId={initialContractId} />
    </>
  );
}
