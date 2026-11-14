import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { ClientNotFoundError } from "@ir/core";
import { buildTomadorSnapshotFromClient, clientDisplayName, type NfseTomadorSnapshot } from "@ir/types";
import { toClientSearchResult } from "../../../../components/admin/clientSearchTypes";
import { getClientService } from "../../../../composition/clientes";
import type { TomadorSnapshotFormInput } from "./actions";
import { NfseDraftForm } from "../../../../features/nfse/NfseDraftForm";
import { getIssuerConfigService, getServiceProfileService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Nova NFS-e — abas reais (Dados da nota/Tomador/Serviço e tributação/
 * Revisão), nunca um wizard longo. A NFS-e não depende de contrato/
 * assinatura/financeiro — só cliente (cadastro mestre, via ClientPicker
 * — nunca a lista inteira de clientes carregada aqui) + perfil de
 * serviço (opcional).
 */
function toFormTomador(snapshot: NfseTomadorSnapshot): TomadorSnapshotFormInput {
  return {
    kind: snapshot.kind, name: snapshot.name, cpf: snapshot.cpf ?? "", cnpj: snapshot.cnpj ?? "",
    municipalRegistration: snapshot.municipalRegistration ?? "", stateRegistration: snapshot.stateRegistration ?? "",
    zip: snapshot.zip ?? "", street: snapshot.street ?? "", number: snapshot.number ?? "",
    complement: snapshot.complement ?? "", neighborhood: snapshot.neighborhood ?? "",
    city: snapshot.city ?? "", state: snapshot.state ?? "", ibgeCode: snapshot.ibgeCode ?? "",
    email: snapshot.email ?? "", phone: snapshot.phone ?? "",
  };
}

export default async function NovaNfsePage(props: { searchParams: Promise<{ clientId?: string | string[] }> }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const { clientId } = await props.searchParams;
  const requestedId = typeof clientId === "string" ? clientId : "";
  const [serviceProfiles, issuerConfig, chosenClient] = await Promise.all([
    getServiceProfileService(supabase).list(),
    getIssuerConfigService(supabase).getCurrent(),
    requestedId
      ? getClientService(supabase).getById(requestedId).catch((error: unknown) => {
          if (error instanceof ClientNotFoundError) return null;
          throw error;
        })
      : Promise.resolve(null),
  ]);
  const initialSnapshot = chosenClient ? buildTomadorSnapshotFromClient(chosenClient, clientDisplayName(chosenClient)) : null;

  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e / NOVA"
        title="Nova NFS-e"
        description="Tomador, serviço, valores, tributação e descrição — salvos como rascunho. Nenhuma transmissão real ainda."
      />
      <NfseDraftForm
        mode="create"
        serviceProfiles={serviceProfiles}
        issuerConfigured={Boolean(issuerConfig)}
        issuerConfig={issuerConfig}
        initialSelectedClient={chosenClient ? toClientSearchResult(chosenClient) : null}
        initialTomador={initialSnapshot ? toFormTomador(initialSnapshot) : undefined}
      />
    </>
  );
}
