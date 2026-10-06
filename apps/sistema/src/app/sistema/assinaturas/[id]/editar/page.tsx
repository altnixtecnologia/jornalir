import { notFound } from "next/navigation";
import { SubscriptionNotFoundError } from "@ir/core";
import { SUBSCRIPTION_SERVICE_TYPE_LABELS } from "@ir/types";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { SubscriptionForm } from "../../../../../features/assinaturas/SubscriptionForm";
import { getSubscriptionService } from "../../../../../composition/assinaturas";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export default async function EditarAssinaturaPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const subscription = await getSubscriptionService(supabase)
    .getById(params.id)
    .catch((error: unknown) => {
      if (error instanceof SubscriptionNotFoundError) return null;
      throw error;
    });
  if (!subscription) notFound();

  const clients = await getClientService(supabase).list();

  return (
    <>
      <ModuleHeader
        eyebrow={`ASSINATURAS / ${subscription.reference}`}
        title={`Editar ${SUBSCRIPTION_SERVICE_TYPE_LABELS[subscription.serviceType]}`}
        description="Serviço, status, valor, periodicidade e datas."
      />
      <SubscriptionForm mode="edit" subscription={subscription} clients={clients} />
    </>
  );
}
