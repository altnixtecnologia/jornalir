import Link from "next/link";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createIssuedNoteRepositorySupabase } from "../../../../providers/supabase/nfseIssuedNoteRepository.supabase";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Notas emitidas (Parte 1, item 3 + Parte 2A, item 10) — lista
 * `nfse_issued_notes`, nunca `nfse_drafts`. Enquanto nenhuma
 * transmissão real tiver acontecido, mostra um estado vazio
 * explicativo — nunca dados falsos pra aparentar emissão.
 */
export default async function NfseNotasPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const notes = await createIssuedNoteRepositorySupabase(supabase).listAll();

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
                <th>Chave de acesso</th>
                <th>Competência</th>
                <th>Valor</th>
                <th>Ambiente</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr key={note.id}>
                  <td>
                    <Link className="materia-title-link" href={`/sistema/nfse/rascunhos/${note.draftId}`}>
                      {note.nfseNumber ?? "—"}
                    </Link>
                  </td>
                  <td>{note.accessKey ?? "—"}</td>
                  <td>{formatDate(note.competencyDate)}</td>
                  <td>{formatAmount(note.serviceValue)}</td>
                  <td>{note.environment === "homologation" ? "Homologação" : "Produção"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
