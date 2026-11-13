import "server-only";
import { NextResponse } from "next/server";
import { checkModuleAction } from "../../../../../../lib/permissions/checkModuleAction";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { createIssuedNoteRepositorySupabase } from "../../../../../../providers/supabase/nfseIssuedNoteRepository.supabase";
import { readNfseDocument } from "../../../../../../providers/r2/nfseDocuments.r2";
import { isLocalPreviewEnabled } from "../../../../../../lib/auth/localPreview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_req:Request,ctx:{params:Promise<{id:string}>}):Promise<NextResponse> {
  if (isLocalPreviewEnabled()) return NextResponse.json({error:"XML fictício não disponível para download fiscal."},{status:403});
  const permission = await checkModuleAction("nfse","notas_cancelar");
  if (permission) return NextResponse.json({error:permission},{status:403});
  const session = createSupabaseServerClient();
  const {data:authorized} = await session.rpc("is_active_admin_or_owner");
  if (authorized !== true) return NextResponse.json({error:"Acesso negado."},{status:403});
  const {id} = await ctx.params;
  const note = await createIssuedNoteRepositorySupabase(session).getById(id);
  if (!note || !note.nfseXml) return NextResponse.json({error:"XML oficial indisponível."},{status:404});
  try {
    const admin = createSupabaseAdminClient();
    const {data:asset,error} = await admin.from("nfse_document_assets")
      .select("r2_key,sha256").eq("issued_note_id",id).eq("kind","nfse_xml").maybeSingle();
    if (error) throw new Error(error.message);
    const bytes = asset
      ? await readNfseDocument(asset.r2_key,asset.sha256)
      : Buffer.from(note.nfseXml,"utf8"); // fallback enquanto R2 aguarda arquivamento
    return new NextResponse(bytes,{
      headers: {
        "Content-Type":"application/xml; charset=utf-8",
        "Content-Disposition":`attachment; filename="NFS-e-${id}.xml"`,
        "Cache-Control":"private,no-store,max-age=0",
        "X-Content-Type-Options":"nosniff",
      },
    });
  } catch {
    return NextResponse.json({error:"Documento fiscal não pôde ser validado."},{status:503});
  }
}
