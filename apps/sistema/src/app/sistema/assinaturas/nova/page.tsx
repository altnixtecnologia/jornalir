import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
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
  const clients = await getClientService(supabase).list();
  const initialClientId = one(searchParams?.clientId) || undefined;

  return (
    <>
      <ModuleHeader
        eyebrow="ASSINATURAS / NOVA"
        title="Nova assinatura"
        description="Vincule um serviço (impresso, digital ou TV) a um cliente já cadastrado."
      />
      <SubscriptionForm mode="create" clients={clients} initialClientId={initialClientId} />
    </>
  );
}
