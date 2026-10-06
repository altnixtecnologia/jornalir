import { notFound } from "next/navigation";
import { ClientNotFoundError } from "@ir/core";
import { clientDisplayName } from "@ir/types";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { ClientForm } from "../../../../../features/clientes/ClientForm";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export default async function EditarClientePage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const client = await getClientService(supabase)
    .getById(params.id)
    .catch((error: unknown) => {
      if (error instanceof ClientNotFoundError) return null;
      throw error;
    });
  if (!client) notFound();

  return (
    <>
      <ModuleHeader
        eyebrow={`CLIENTES / ${client.reference}`}
        title={`Editar ${clientDisplayName(client)}`}
        description="Identificação, contato, endereço e papéis."
      />
      <ClientForm mode="edit" client={client} />
    </>
  );
}
