import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../../lib/supabase/server";
import { getPrivateContractPdf, isPrivateContractStorageConfigured } from "../../../../../../../lib/contracts/contractStorage.r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const noCache = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };

export async function GET(req: NextRequest, { params }: { params: { id: string; documentId: string } }): Promise<NextResponse> {
  const { id: clientId, documentId } = params;
  if (!UUID.test(clientId) || !UUID.test(documentId)) return NextResponse.json({ error: "Documento inválido." }, { status: 400, headers: noCache });
  const kind = req.nextUrl.searchParams.get("tipo");
  if (kind !== "original" && kind !== "assinado" && kind !== "evidencias") {
    return NextResponse.json({ error: "Tipo de arquivo inválido." }, { status: 400, headers: noCache });
  }
  const db = createSupabaseServerClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sessão necessária." }, { status: 401, headers: noCache });
  const { data: profile } = await db.from("profiles").select("role,active").eq("id",user.id).maybeSingle();
  if (!profile?.active || !["owner","admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403, headers: noCache });
  }
  const { data: document, error } = await db.from("client_contract_documents")
    .select("id,client_id,status,original_storage_key,signed_storage_key,evidence_storage_key")
    .eq("id",documentId).eq("client_id",clientId).maybeSingle();
  if (error || !document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404, headers: noCache });
  if (kind !== "original" && document.status !== "signed") {
    return NextResponse.json({ error: "A assinatura ainda não foi concluída." }, { status: 409, headers: noCache });
  }
  const key = kind === "original" ? document.original_storage_key
    : kind === "assinado" ? document.signed_storage_key : document.evidence_storage_key;
  if (!key) return NextResponse.json({ error: "Arquivo ainda não disponível." }, { status: 404, headers: noCache });
  if (!isPrivateContractStorageConfigured()) {
    return NextResponse.json({ error: "Armazenamento privado em preparação." }, { status: 503, headers: noCache });
  }
  try {
    const body = await getPrivateContractPdf(key, clientId, documentId);
    const isPdf = kind !== "evidencias";
    return new NextResponse(Buffer.from(body), {
      status: 200,
      headers: {
        ...noCache,
        "Content-Type": isPdf ? "application/pdf" : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="contrato-${documentId.slice(0,8)}-${kind}.${isPdf ? "pdf" : "json"}"`,
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível recuperar o documento." }, { status: 503, headers: noCache });
  }
}
