import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { toClientSearchResult } from "../../../../components/admin/clientSearchTypes";
import { SubscriptionForm } from "../../../../features/assinaturas/SubscriptionForm";
import { getClientService } from "../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function NovaAssinaturaPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const initialClientId = one(searchParams?.clientId) || undefined;
  // Resolve só o cadastro pré-selecionado (ex.: ?clientId= vindo da tela de
  // um cliente) — nunca carrega a lista inteira de clientes aqui; o
  // seletor de Cadastro busca sob demanda (ClientPicker/searchClientsAction).
  const initialSelectedClient = initialClientId
    ? await getClientService(supabase)
        .getById(initialClientId)
        .then(toClientSearchResult)
        .catch(() => null)
    : null;

  return (
    <>
      <ModuleHeader
        eyebrow="ASSINATURAS / NOVA"
        title="Nova assinatura"
        description="Vincule um serviço (impresso, digital ou TV) a um cliente já cadastrado."
      />
      <SubscriptionForm mode="create" initialSelectedClient={initialSelectedClient} />
    </>
  );
}
