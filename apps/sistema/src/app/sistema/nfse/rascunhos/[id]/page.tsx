import { notFound } from "next/navigation";
import { DraftNotFoundError, checkHomologationReadiness } from "@ir/core";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { NfseDraftForm } from "../../../../../features/nfse/NfseDraftForm";
import { NfseTransmissionPanel } from "../../../../../features/nfse/NfseTransmissionPanel";
import { toClientSearchResult } from "../../../../../components/admin/clientSearchTypes";
import { getDraftService, getIssuerConfigService, getServiceProfileService, getCertificateService } from "../../../../../composition/nfse";
import { getClientService } from "../../../../../composition/clientes";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createIssuedNoteRepositorySupabase } from "../../../../../providers/supabase/nfseIssuedNoteRepository.supabase";
import { createTransmissionAttemptRepositorySupabase } from "../../../../../providers/supabase/nfseTransmissionAttemptRepository.supabase";
import { isLocalPreviewEnabled } from "../../../../../lib/auth/localPreview";

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

  // Só o cliente deste rascunho — nunca a lista inteira (mesmo princípio
  // já aplicado em Assinaturas/Financeiro: ClientPicker busca sob demanda).
  const [selectedClient, serviceProfiles, issuerConfig, issuedNote, attempts] = await Promise.all([
    getClientService(supabase)
      .getById(draft.clientId)
      .then(toClientSearchResult)
      .catch(() => null),
    getServiceProfileService(supabase).list(),
    getIssuerConfigService(supabase).getCurrent(),
    createIssuedNoteRepositorySupabase(supabase).getByDraftId(draft.id),
    createTransmissionAttemptRepositorySupabase(supabase).listByDraftId(draft.id),
  ]);

  const activeCertificate = issuerConfig ? await getCertificateService(supabase).getActiveInfo(issuerConfig.id) : null;
  const readiness = checkHomologationReadiness({
    issuerConfig,
    activeCertificate,
    cTribNacConfigured: Boolean(draft.fiscal.cTribNac?.trim()),
    lastXsdValidationValid: null,
  });

  return (
    <>
      <ModuleHeader
        eyebrow={`NFS-e / RASCUNHOS / ${draft.reference}`}
        title={draft.tomador.name}
        description="Rascunho — ainda não existe transmissão real para o Sistema Nacional."
      />

      <NfseTransmissionPanel
        draft={draft}
        issuedNote={issuedNote}
        attempts={attempts}
        issuerConfigured={Boolean(issuerConfig)}
        blockingReasons={readiness.missing}
        previewMode={isLocalPreviewEnabled()}
      />

      {!issuedNote ? (
        <NfseDraftForm
          mode="edit"
          serviceProfiles={serviceProfiles}
          issuerConfigured={Boolean(issuerConfig)}
          issuerConfig={issuerConfig}
          initialDraft={draft}
          initialSelectedClient={selectedClient}
        />
      ) : null}
    </>
  );
}
