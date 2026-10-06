import { notFound } from "next/navigation";
import { DraftNotFoundError } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { NfseDraftForm } from "../../../../../features/nfse/NfseDraftForm";
import { getDraftService, getIssuerConfigService, getServiceProfileService } from "../../../../../composition/nfse";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NfseRascunhoDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const draftService = getDraftService(supabase);
  const draft = await draftService.getById(params.id).catch((error: unknown) => {
    if (error instanceof DraftNotFoundError) return null;
    throw error;
  });
  if (!draft) notFound();

  const [clients, serviceProfiles, issuerConfig] = await Promise.all([
    getClientService(supabase).list(),
    getServiceProfileService(supabase).list(),
    getIssuerConfigService(supabase).getCurrent(),
  ]);

  return (
    <>
      <ModuleHeader
        eyebrow={`NFS-e / RASCUNHOS / ${draft.reference}`}
        title={draft.tomador.name}
        description="Rascunho — ainda não existe transmissão real para o Sistema Nacional."
      />
      <NfseDraftForm
        mode="edit"
        clients={clients}
        serviceProfiles={serviceProfiles}
        issuerConfigured={Boolean(issuerConfig)}
        initialDraft={draft}
      />
    </>
  );
}
