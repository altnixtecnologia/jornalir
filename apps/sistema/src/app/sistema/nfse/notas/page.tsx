import Link from "next/link";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createIssuedNoteRepositorySupabase } from "../../../../providers/supabase/nfseIssuedNoteRepository.supabase";
import { getDraftService } from "../../../../composition/nfse";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Notas emitidas (Parte 1, item 3 + Parte 2A, item 10) — lista
 * `nfse_issued_notes`, nunca `nfse_drafts`. Enquanto nenhuma
 * transmissão real tiver acontecido, mostra um estado vazio
 * explicativo — nunca dados falsos pra aparentar emissão. Tomador/
 * Serviço/Referência vêm do rascunho de origem (join real por
 * draftId) — a nota em si nunca guarda esse snapshot de novo.
 */
export default async function NfseNotasPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const [notes, drafts] = await Promise.all([createIssuedNoteRepositorySupabase(supabase).listAll(), getDraftService(supabase).list()]);
  const draftsById = new Map(drafts.map((draft) => [draft.id, draft]));

  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e / NOTAS EMITIDAS"
        title="Notas emitidas"
        description="NFS-e efetivamente autorizadas pelo Sistema Nacional — nunca simuladas."
      />

      {notes.length === 0 ? (
        <section className="form-section form-section--first">
          <p className="helper-text">
            Nenhuma NFS-e foi transmitida ainda. Até lá, trabalhe com os{" "}
            <Link className="materia-title-link" href="/sistema/nfse/rascunhos">rascunhos</Link>.
          </p>
        </section>
      ) : (
        <div className="materias-table-wrap">
          <table className="materias-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Emissão</th>
                <th>Tomador</th>
                <th>Serviço</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Chave de acesso</th>
                <th>Referência</th>
                <th>Cancelamento</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => {
                const draft = draftsById.get(note.draftId);
                return (
                  <tr key={note.id}>
                    <td>{note.nfseNumber ?? "—"}</td>
                    <td>{note.issuedAt ? formatDateTime(note.issuedAt) : "—"}</td>
                    <td>{draft?.tomador.name ?? "—"}</td>
                    <td>{draft?.fiscal.cTribNac ?? "—"}</td>
                    <td>{formatAmount(note.serviceValue)}</td>
                    <td>
                      <span className="status-pill status-pill--published">Autorizada</span>
                    </td>
                    <td>{note.accessKey ?? "—"}</td>
                    <td>
                      <Link className="materia-title-link" href={`/sistema/nfse/rascunhos/${note.draftId}`}>
                        {draft?.reference ?? note.draftId}
                      </Link>
                    </td>
                    <td>
                      <Link className="materia-title-link" href={`/sistema/nfse/notas/${note.id}`}>
                        Ver/solicitar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
