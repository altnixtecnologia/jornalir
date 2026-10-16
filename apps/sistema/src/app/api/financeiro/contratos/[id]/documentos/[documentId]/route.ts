import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../../../../lib/supabase/server";
import { getContractService } from "../../../../../../../composition/financeiro";

export const dynamic = "force-dynamic";

/**
 * Documentos contratuais não são públicos. Este endpoint confere a
 * sessão, o módulo financeiro, o contrato e a vinculação do documento.
 * Somente então produz URL assinada de curtíssima validade.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; documentId: string } },
): Promise<NextResponse> {
  const unauthorized = () => NextResponse.json({ error: "Acesso não autorizado." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const notFound = () => NextResponse.json({ error: "Documento não encontrado." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  if (!uuid.test(params.id) || !uuid.test(params.documentId)) return notFound();
  const supabase = createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return unauthorized();
  const { data: allowed, error: allowedError } = await supabase.rpc("staff_can_see_module", { p_module: "financeiro" });
  if (allowedError || allowed !== true) return unauthorized();

  try {
    const service = getContractService(supabase);
    await service.getById(params.id);
    const docs = await service.listDocuments(params.id);
    const document = docs.find((item) => item.id === params.documentId);
    const path = document?.fileReference;
    if (!path || !path.startsWith(`contracts/${params.id}/`) || !path.endsWith(".pdf")) return notFound();
    const { data, error } = await supabase.storage.from("contract-documents").createSignedUrl(path, 90);
    if (error || !data?.signedUrl) return notFound();
    const response = NextResponse.redirect(data.signedUrl, 302);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return notFound();
  }
}
