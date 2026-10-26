import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { checkModuleAction } from "../../../../../../lib/permissions/checkModuleAction";
import { createIssuedNoteRepositorySupabase } from "../../../../../../providers/supabase/nfseIssuedNoteRepository.supabase";
import { getCancellationService } from "../../../../../../composition/nfse";
import { extractDanfseData, DanfseDataError } from "@ir/core/src/nfse/danfse-data";
import { buildDanfsePdf } from "../../../../../../lib/nfse/danfsePdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download/visualização do DANFSe (Bloco 2, 26/10/2026 — "Integrar
 * download e visualização ao módulo NFS-e original, com permissão
 * server-side"). Reaproveita a MESMA permissão já usada pra consultar/
 * cancelar a nota (`notas_cancelar`, ver query-actions.ts) — nunca
 * cria uma permissão nova sem necessidade. Gera o PDF SEMPRE server-
 * side, a partir do XML já persistido (`nfseXml`) — nenhum dado vem do
 * navegador. Falha com 404/422 (nunca 200 com um PDF vazio/inventado)
 * se a nota não existir ou o XML estiver ausente/inválido.
 */
function denied(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const permissionError = await checkModuleAction("nfse", "notas_cancelar");
  if (permissionError) return denied(403, permissionError);

  const supabase = createSupabaseServerClient();
  const note = await createIssuedNoteRepositorySupabase(supabase).getById(params.id);
  if (!note) return denied(404, "NFS-e não encontrada.");

  let data;
  try {
    data = extractDanfseData(note);
  } catch (error) {
    if (error instanceof DanfseDataError) return denied(422, error.message);
    throw error;
  }

  const history = await getCancellationService(supabase).listHistory(note.id);
  const cancelled = history.some((item) => item.status === "confirmed");

  const pdfBytes = await buildDanfsePdf(data, { cancelled });
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="DANFSe-${note.nfseNumber ?? note.id}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
