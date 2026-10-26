import { notFound } from "next/navigation";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createIssuedNoteRepositorySupabase } from "../../../../../providers/supabase/nfseIssuedNoteRepository.supabase";
import { getDraftService, getCancellationService } from "../../../../../composition/nfse";
import { NfseCancellationPanel } from "../../../../../features/nfse/NfseCancellationPanel";
import { NfseConsultationPanel } from "../../../../../features/nfse/NfseConsultationPanel";
import { isLocalPreviewEnabled } from "../../../../../lib/auth/localPreview";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Detalhe da nota emitida + preparação do cancelamento (Item 5, Lote
 * 2, Tarefa 5). A identificação da nota autorizada acontece aqui
 * (getById) — a permissão de quem pode solicitar cancelamento é
 * conferida de novo, no servidor, em cancellation-actions.ts (nunca
 * confia só na navegação ter chegado até esta página).
 */
export default async function NfseNotaDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const note = await createIssuedNoteRepositorySupabase(supabase).getById(params.id);
  if (!note) notFound();

  const [draft, history] = await Promise.all([
    getDraftService(supabase).getById(note.draftId),
    getCancellationService(supabase).listHistory(note.id),
  ]);
  const previewMode = isLocalPreviewEnabled();

  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e / NOTA EMITIDA"
        title={"NFS-e " + (note.nfseNumber ?? note.dpsId) + (previewMode ? " (demonstração)" : "")}
        description={draft ? "Tomador: " + draft.tomador.name : "Detalhe da nota autorizada."}
      />
      {previewMode ? (
        <section className="form-section form-section--first">
          <p className="form-error" role="alert">
            Modo demonstração — esta nota NUNCA foi transmitida ao Sistema Nacional. Número, chave de acesso e valores são fictícios.
          </p>
        </section>
      ) : null}
      <section className="form-section form-section--first">
        <div className="form-grid">
          <div className="form-field">
            <span className="field-label">Valor</span>
            <span>{formatAmount(note.serviceValue)}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Chave de acesso</span>
            <span>{note.accessKey ?? "—"}</span>
          </div>
          <div className="form-field">
            <span className="field-label">Competência</span>
            <span>{note.competencyDate}</span>
          </div>
        </div>
      </section>
      <NfseConsultationPanel accessKey={note.accessKey} />
      <NfseCancellationPanel issuedNoteId={note.id} history={history} />
    </>
  );
}
