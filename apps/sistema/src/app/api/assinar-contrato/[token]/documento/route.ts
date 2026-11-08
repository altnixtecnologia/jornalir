import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
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
  const { data: companyRound, error: companyError } = await admin.from("contract_company_signature_rounds")
    .select("final_path,final_sha256").eq("final_document_id", invitation.document_id)
    .eq("status", "completed").maybeSingle();
  if (companyError || !companyRound?.final_path || !companyRound.final_sha256 ||
      companyRound.final_path !== source.path) return denied();
  let documentPath = source.path;
  let sha256 = String(companyRound.final_sha256);
  if (invitation.request_id) {
    // O aceite deve recair sobre a versão cumulativa MAIS RECENTE. Não
    // apresentar apenas o PDF original se outras pessoas já assinaram.
    const { data: previous, error: previousError } = await admin.from("contract_signature_invitations")
      .select("signed_document_id,signed_sha256").eq("request_id", invitation.request_id)
      .eq("status", "signed").order("signed_at", { ascending: false }).limit(1).maybeSingle();
    if (previousError) return denied();
    if (previous?.signed_document_id) {
      const { data: doc, error: docError } = await admin.from("contract_documents")
        .select("file_reference,contract_id")
        .eq("id", previous.signed_document_id).eq("contract_id", invitation.contract_id).maybeSingle();
      if (docError || !doc) return denied();
      documentPath = String(doc.file_reference);
      sha256 = String(previous.signed_sha256 ?? "");
    }
  }
  if (!documentPath.startsWith("contracts/" + invitation.contract_id + "/") ||
      !documentPath.endsWith(".pdf") || !/^[a-f0-9]{64}$/.test(sha256)) return denied();
  const { data, error } = await admin.storage.from("contract-documents").download(documentPath);
  if (error || !data) return denied();
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0,5)) !== "%PDF-" ||
      createHash("sha256").update(bytes).digest("hex") !== sha256) return denied();
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
