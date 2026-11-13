import { notFound } from "next/navigation";
import Link from "next/link";
import { ModuleHeader } from "../../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";
import { createIssuedNoteRepositorySupabase } from "../../../../../providers/supabase/nfseIssuedNoteRepository.supabase";
import { getDraftService, getCancellationService } from "../../../../../composition/nfse";
import { NfseCancellationPanel } from "../../../../../features/nfse/NfseCancellationPanel";
import { NfseConsultationPanel } from "../../../../../features/nfse/NfseConsultationPanel";
import { isLocalPreviewEnabled } from "../../../../../lib/auth/localPreview";
import { isRestrictedSefinEnvironment, restrictedSefinEnvironmentFromServer } from "../../../../../lib/nfse/restrictedSefinGate";

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
export default async function NfseNotaDetailPage(props: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const params = await props.params;
  const supabase = createSupabaseServerClient();
  const note = await createIssuedNoteRepositorySupabase(supabase).getById(params.id);
  if (!note) notFound();

  const previewMode = isLocalPreviewEnabled();
  const { data: canManageCancellation } = previewMode
    ? { data: true }
    : await supabase.rpc("is_active_admin_or_owner");
  // O historico de cancelamentos fica em tabela service_role-only;
  // somente owner/admin pode consulta-lo pelo servidor.
  const [draft, history] = await Promise.all([
    getDraftService(supabase).getById(note.draftId),
    canManageCancellation === true
      ? getCancellationService(supabase).listHistory(note.id)
      : Promise.resolve([]),
  ]);

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
        {previewMode ? (
          <p className="helper-text">DANFSe indisponível em modo demonstração — o XML desta nota é fictício, nunca um XML real retornado pela SEFIN.</p>
        ) : (
          <div className="form-actions">
            <Link className="form-action-primary" href={`/sistema/nfse/notas/${note.id}/danfse`} target="_blank" rel="noopener noreferrer">
              Baixar DANFSe
            </Link>
          </div>
        )}
      </section>
      <NfseConsultationPanel noteId={note.id} accessKey={note.accessKey} previewMode={previewMode} restrictedMode={isRestrictedSefinEnvironment(restrictedSefinEnvironmentFromServer())} />
      {canManageCancellation === true ? (
        <NfseCancellationPanel issuedNoteId={note.id} history={history} />
      ) : (
        <section className="form-section">
          <h2>Cancelamento</h2>
          <p className="helper-text">Somente administradores e proprietarios podem consultar ou preparar cancelamentos fiscais.</p>
        </section>
      )}
    </>
  );
}
