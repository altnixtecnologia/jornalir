import Link from "next/link";
import { ModuleHeader } from "../../../../components/admin/ModuleHeader";
import { getDraftService } from "../../../../composition/nfse";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

function formatAmount(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Rascunhos de NFS-e (Parte 1, item 3/11) — nunca mostra estado de
 * autorização; "Rascunho" é o único status possível nesta fase.
 */
export default async function NfseRascunhosPage(): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const drafts = await getDraftService(supabase).list();

  return (
    <>
      <ModuleHeader
        eyebrow="NFS-e / RASCUNHOS"
        title="Rascunhos"
        description="Nenhum rascunho aqui foi transmitido — a integração real ainda não existe."
        action={
          <Link className="form-action-primary" href="/sistema/nfse/nova">
            Nova NFS-e
          </Link>
        }
      />

      {drafts.length === 0 ? (
        <p className="helper-text">Nenhum rascunho criado ainda.</p>
      ) : (
        <div className="materias-table-wrap">
          <table className="materias-table">
            <thead>
              <tr>
                <th>Referência</th>
                <th>Tomador</th>
                <th>Competência</th>
                <th>Valor</th>
                <th>Criado em</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id}>
                  <td>
                    <Link className="materia-title-link" href={`/sistema/nfse/rascunhos/${draft.id}`}>
                      {draft.reference}
                    </Link>
                  </td>
                  <td>{draft.tomador.name}</td>
                  <td>{formatDate(draft.competencyDate)}</td>
                  <td>{formatAmount(draft.serviceValue)}</td>
                  <td>{formatDate(draft.createdAt.slice(0, 10))}</td>
                  <td>
                    <span className="status-pill status-pill--draft">Rascunho</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
