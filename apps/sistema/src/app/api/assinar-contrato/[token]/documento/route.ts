import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import {
  findSignatureInvitation, findInvitationSource, invitationIsPending,
} from "../../../../../lib/signatures/contractSignatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, {
  params,
}: { params: { token: string } }): Promise<NextResponse> {
  const denied = () => NextResponse.json({ error: "Documento indisponível." },
    { status: 404, headers: { "Cache-Control": "no-store" } });
  const invitation = await findSignatureInvitation(params.token);
  if (!invitation || !invitationIsPending(invitation)) return denied();
  const source = await findInvitationSource(invitation);
  if (!source) return denied();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from("contract-documents").download(source.path);
  if (error || !data) return denied();
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0,5)) !== "%PDF-") return denied();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=documento-para-conferencia.pdf",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "no-referrer",
    },
  });
}
