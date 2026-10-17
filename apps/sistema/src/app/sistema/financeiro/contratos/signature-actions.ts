"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import {
  findInvitationSource, findSignatureInvitation, hashInvitationToken, invitationIsPending,
  type SignatureInvitation,
} from "../../../../lib/signatures/contractSignatures";
import { buildSignatureReceiptPdf } from "../../../../lib/signatures/signatureReceiptPdf";
import { buildSignedContractPdf } from "../../../../lib/signatures/signedContractPdf";

type Result<T = never> = { error: string } | { ok: true } & T;
const PDF_BUCKET = "contract-documents";
const SIGN_BUCKET = "contract-signatures";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireFinanceAccess(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) throw new Error("Sessão expirada.");
  const { data: allowed, error } = await supabase.rpc("staff_can_see_module", { p_module: "financeiro" });
  if (error || allowed !== true) throw new Error("Sem permissão para assinar contratos.");
  return userData.user.id;
}

export type PublicSignatureInvite = Pick<
  SignatureInvitation,
  "id" | "contract_id" | "document_id" | "signer_name" | "signer_email" |
  "signer_phone" | "status" | "expires_at" | "signed_at" | "created_at" | "receipt_document_id" | "signed_document_id"
>;

export async function listSignatureInvitationsAction(contractId: string): Promise<Result<{ invitations: PublicSignatureInvite[] }>> {
  try {
    await requireFinanceAccess();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("contract_signature_invitations")
      .select("id,contract_id,document_id,signer_name,signer_email,signer_phone,status,expires_at,signed_at,created_at,receipt_document_id,signed_document_id")
      .eq("contract_id", contractId).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return { ok: true, invitations: (data ?? []) as PublicSignatureInvite[] };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível carregar os convites." };
  }
}

export async function createSignatureInvitationAction(input: {
  contractId: string; documentId: string; signerName: string;
  signerEmail: string; signerPhone?: string;
}): Promise<Result<{ invitationId: string; urlPath: string }>> {
  try {
    const actorId = await requireFinanceAccess();
    const signerName = input.signerName.trim().replace(/\s+/g, " ").slice(0, 180);
    const signerEmail = input.signerEmail.trim().toLowerCase().slice(0, 254);
    const signerPhone = (input.signerPhone ?? "").replace(/\D/g, "");
    if (signerName.length < 3) return { error: "Informe o nome completo de quem assinará." };
    if (!EMAIL_RE.test(signerEmail)) return { error: "Informe um e-mail válido." };
    if (signerPhone && (signerPhone.length < 10 || signerPhone.length > 13)) {
      return { error: "Informe um WhatsApp com DDD válido ou deixe em branco." };
    }
    const admin = createSupabaseAdminClient();
    const { data: document, error: docError } = await admin.from("contract_documents")
      .select("id,file_reference,contract_id")
      .eq("id", input.documentId).eq("contract_id", input.contractId).maybeSingle();
    if (docError || !document || !String(document.file_reference ?? "").startsWith("contracts/" + input.contractId + "/")) {
      return { error: "Selecione um PDF privado do contrato." };
    }
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const { data, error } = await admin.from("contract_signature_invitations")
      .insert({
        contract_id: input.contractId, document_id: input.documentId,
        signer_name: signerName, signer_email: signerEmail,
        signer_phone: signerPhone || null,
        token_sha256: hashInvitationToken(token),
        created_by: actorId,
        expires_at: expiresAt,
      }).select("id").single();
    if (error || !data) throw new Error("Não foi possível criar o convite: " + (error?.message ?? ""));
    revalidatePath("/sistema/financeiro/contratos/" + input.contractId);
    // Token só é retornado UMA VEZ ao navegador do operador que criou.
    return { ok: true, invitationId: data.id, urlPath: "/assinar-contrato/" + token };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível gerar o convite." };
  }
}

export async function revokeSignatureInvitationAction(
  contractId: string, invitationId: string,
): Promise<Result<{ revoked: true }>> {
  try {
    await requireFinanceAccess();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("contract_signature_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", invitationId).eq("contract_id", contractId).eq("status", "pending").select("id").maybeSingle();
    if (error) throw error;
    if (!data) return { error: "Convite inexistente ou que já não pode ser revogado." };
    revalidatePath("/sistema/financeiro/contratos/" + contractId);
    return { ok: true, revoked: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível revogar o convite." };
  }
}

/**
 * Autentica o signatário pelo e-mail do convite através do Supabase Auth.
 * Usa o e-mail persistido pelo operador, nunca um endereço enviado livre
 * pelo navegador. Requer o template de e-mail com {{ .Token }} no Auth.
 */
export async function requestSignerEmailCodeAction(token: string): Promise<Result<{ sent: true }>> {
  try {
    const invitation = await findSignatureInvitation(token);
    if (!invitation || !invitationIsPending(invitation)) {
      return { error: "Convite não encontrado ou expirado." };
    }
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: invitation.signer_email,
      options: { shouldCreateUser: true },
    });
    if (error) return { error: "Não foi possível enviar o código agora. Verifique o limite do serviço de e-mail e tente novamente." };
    return { ok: true, sent: true };
  } catch {
    return { error: "Serviço de confirmação de e-mail indisponível." };
  }
}

export async function verifySignerEmailCodeAction(token: string, code: string): Promise<Result<{ verified: true }>> {
  try {
    const invitation = await findSignatureInvitation(token);
    if (!invitation || !invitationIsPending(invitation)) return { error: "Convite não encontrado ou expirado." };
    const otp = code.replace(/\s/g, "");
    if (!/^\d{6,8}$/.test(otp)) return { error: "Informe o código recebido por e-mail." };
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: invitation.signer_email,
      token: otp,
      type: "email",
    });
    if (error || data.user?.email?.toLowerCase() !== invitation.signer_email.toLowerCase()) {
      return { error: "Código inválido ou expirado. Solicite um novo código." };
    }
    return { ok: true, verified: true };
  } catch {
    return { error: "Não foi possível confirmar o código." };
  }
}

function sameName(a: string, b: string): boolean {
  const norm = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return norm(a) === norm(b);
}

export async function completeSignatureInvitationAction(input: {
  token: string;
  signerName: string;
  signerEmail: string;
  consent: boolean;
  imageDataUrl: string;
}): Promise<Result<{ receiptId: string }>> {
  try {
    if (!input.consent) return { error: "É necessário concordar com o termo antes de assinar." };
    const invitation = await findSignatureInvitation(input.token);
    if (!invitation || !invitationIsPending(invitation)) {
      return { error: "Convite inválido, utilizado, revogado ou expirado." };
    }
    if (!sameName(input.signerName, invitation.signer_name) ||
        input.signerEmail.trim().toLowerCase() !== invitation.signer_email.trim().toLowerCase()) {
      return { error: "Nome ou e-mail não corresponde ao destinatário deste convite." };
    }
    const verifiedClient = createSupabaseServerClient();
    const { data: verifiedUser, error: verifiedError } = await verifiedClient.auth.getUser();
    if (verifiedError || verifiedUser.user?.email?.toLowerCase() !== invitation.signer_email.toLowerCase()) {
      return { error: "Confirme primeiro o código enviado ao e-mail do convite para assinar." };
    }
    const source = await findInvitationSource(invitation);
    if (!source) return { error: "PDF original não encontrado." };
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input.imageDataUrl);
    if (!match || match[1].length > 1100000) return { error: "Assinatura inválida ou muito grande." };
    const png = Buffer.from(match[1], "base64");
    if (png.length < 150 || png.length > 800000) return { error: "Desenhe sua assinatura para continuar." };
    const signature = sharp(png);
    const metadata = await signature.metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height ||
        metadata.width > 2400 || metadata.height > 1200) {
      return { error: "Formato ou dimensões da assinatura inválidos." };
    }
    const stats = await sharp(png).flatten({ background: "#ffffff" }).stats();
    if ((stats.channels[0]?.stdev ?? 0) < 3) return { error: "Desenhe a assinatura na área indicada." };
    const jpeg = await sharp(png).flatten({ background: "#ffffff" })
      .resize({ width: 640, height: 240, fit: "contain", background: "#ffffff" })
      .jpeg({ quality: 82 }).toBuffer();
    const jpegInfo = await sharp(jpeg).metadata();

    const admin = createSupabaseAdminClient();
    const { data: original, error: downloadError } = await admin.storage.from(PDF_BUCKET).download(source.path);
    if (downloadError || !original) return { error: "Não foi possível conferir o documento original." };
    const originalBytes = Buffer.from(await original.arrayBuffer());
    if (!originalBytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return { error: "O PDF original não está íntegro." };
    }
    const originalSha256 = createHash("sha256").update(originalBytes).digest("hex");
    const signedAt = new Date().toISOString();
    const receiptBytes = buildSignatureReceiptPdf({
      signerName: invitation.signer_name, signerEmail: invitation.signer_email,
      documentName: source.filename, contractNumber: source.contractNumber, signedAt,
      originalSha256, invitationId: invitation.id,
      jpegBytes: jpeg, jpegWidth: jpegInfo.width ?? 640, jpegHeight: jpegInfo.height ?? 240,
    });
    const receiptSha256 = createHash("sha256").update(receiptBytes).digest("hex");
    const signedPdfBytes = await buildSignedContractPdf({
      originalBytes, signatureJpeg: jpeg, documentName: source.filename,
      signerName: invitation.signer_name, signerEmail: invitation.signer_email,
      signedAt, originalSha256, invitationId: invitation.id,
    });
    if (signedPdfBytes.byteLength > 10 * 1024 * 1024) {
      return { error: "O PDF assinado excedeu 10 MB. Solicite à equipe a compactação do documento antes de assinar." };
    }
    const signedSha256 = createHash("sha256").update(signedPdfBytes).digest("hex");
    const signaturePath = "signatures/" + invitation.id + ".jpg";
    const receiptPath = "contracts/" + invitation.contract_id + "/signing/" + invitation.id + ".pdf";
    const signedPath = "contracts/" + invitation.contract_id + "/signing/" + invitation.id + "-signed.pdf";

    const { error: pngError } = await admin.storage.from(SIGN_BUCKET).upload(signaturePath, jpeg, {
      contentType: "image/jpeg", upsert: false, cacheControl: "0",
    });
    if (pngError) return { error: "Assinatura já processada ou erro de armazenamento. Reabra o link para verificar." };
    const { error: pdfError } = await admin.storage.from(PDF_BUCKET).upload(receiptPath, receiptBytes, {
      contentType: "application/pdf", upsert: false, cacheControl: "0",
    });
    if (pdfError) return { error: "Falha ao guardar comprovante. Contate o responsável pelo contrato." };
    const { error: signedPdfError } = await admin.storage.from(PDF_BUCKET).upload(signedPath, signedPdfBytes, {
      contentType: "application/pdf", upsert: false, cacheControl: "0",
    });
    if (signedPdfError) return { error: "Falha ao guardar o documento com assinatura. Contate a equipe." };
    const h = headers();
    const remoteIp = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const audit = {
      signedAt, consent: "contract-v1",
      ipHash: remoteIp ? createHash("sha256").update(remoteIp).digest("hex") : null,
      userAgent: (h.get("user-agent") ?? "").slice(0, 400),
      method: "verified-email-otp-and-graphical-acceptance",
      originalDocumentId: invitation.document_id,
    };
    const { data: receiptId, error: finalizeError } = await admin.rpc("finalize_contract_signature", {
      p_invitation_id: invitation.id, p_token_hash: hashInvitationToken(input.token),
      p_signature_path: signaturePath, p_receipt_storage_path: receiptPath,
      p_signed_storage_path: signedPath,
      p_original_sha256: originalSha256, p_receipt_sha256: receiptSha256,
      p_signed_sha256: signedSha256,
      p_audit_metadata: audit,
    });
    if (finalizeError || !receiptId) {
      return { error: "O comprovante foi guardado, mas a confirmação não foi concluída. Solicite verificação à equipe." };
    }
    revalidatePath("/sistema/financeiro/contratos/" + invitation.contract_id);
    return { ok: true, receiptId: String(receiptId) };
  } catch {
    return { error: "Não foi possível finalizar a assinatura. Confira sua conexão ou contate o responsável." };
  }
}
