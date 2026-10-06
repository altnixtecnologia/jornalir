import Link from "next/link";
import type { ContractStatus } from "@ir/types";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUSES } from "@ir/types";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { ContractsList } from "../../../../features/financeiro/ContractsList";
import { getContractService } from "../../../../composition/financeiro";
import { getClientService } from "../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContratosPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const status = one(searchParams?.status);

  const [contracts, clients] = await Promise.all([
    getContractService(supabase).list({
      status: CONTRACT_STATUSES.includes(status as ContractStatus) ? (status as ContractStatus) : undefined,
    }),
    getClientService(supabase).list(),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow="FINANCEIRO / CONTRATOS INSTITUCIONAIS"
        title="Contratos institucionais"
        description="Prefeituras, câmaras, autarquias e demais órgãos — um contrato pode gerar vários títulos."
        action={
          <Link className="form-action-primary" href="/sistema/financeiro/contratos/novo">
            Novo contrato
          </Link>
        }
      />

      <form className="materias-toolbar" method="get" action="/sistema/financeiro/contratos">
        <div className="materias-filters">
          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="">Todos</option>
              {CONTRACT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {CONTRACT_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Filtrar</button>
          <Link className="secondary-link" href="/sistema/financeiro/contratos">Limpar</Link>
        </div>
        <span className="materias-count">{contracts.length} contrato(s)</span>
      </form>

      <ContractsList contracts={contracts} clients={clients} />
    </>
  );
}
