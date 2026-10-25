"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { checkFinanceAction } from "../../../../lib/permissions/checkFinanceAction";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import {
  claimSignatureTurn, findSignatureInvitation, hashInvitationToken,
  invitationIsPending, releaseSignatureTurn, SignatureTurnClaimError,
  type SignatureInvitation, type SignatureRequest,
} from "../../../../lib/signatures/contractSignatures";

export type { SignatureRequest };
import { buildSignatureReceiptPdf } from "../../../../lib/signatures/signatureReceiptPdf";
import { buildSignedContractPdf } from "../../../../lib/signatures/signedContractPdf";
import {
  isWhatsappSignatureTemplateConfigured, sendWhatsappSignatureInviteTemplate,
} from "../../../../lib/financeiro/whatsappCloudProvider";

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
  "id" | "contract_id" | "document_id" | "request_id" | "previous_invitation_id" | "signer_name" | "signer_email" |
  "signer_phone" | "status" | "expires_at" | "signed_at" | "created_at" | "receipt_document_id" | "signed_document_id" | "notification_channel" | "notification_status" | "notification_message_id"
>;

export async function listSignatureInvitationsAction(contractId: string): Promise<Result<{ invitations: PublicSignatureInvite[] }>> {
  try {
    await requireFinanceAccess();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("contract_signature_invitations")
      .select("id,contract_id,document_id,request_id,previous_invitation_id,signer_name,signer_email,signer_phone,status,expires_at,signed_at,created_at,receipt_document_id,signed_document_id,notification_channel,notification_status,notification_message_id")
      .eq("contract_id", contractId).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return { ok: true, invitations: (data ?? []) as PublicSignatureInvite[] };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível carregar os convites." };
  }
}

/** Rodadas com múltiplos signatários do contrato — pra a UI mostrar quem assinou/quem está pendente por rodada. */
export async function listSignatureRequestsAction(contractId: string): Promise<Result<{ requests: SignatureRequest[] }>> {
  try {
    await requireFinanceAccess();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("contract_signature_requests")
      .select("id,contract_id,document_id,status,final_document_id,created_at,completed_at")
      .eq("contract_id", contractId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return { ok: true, requests: (data ?? []) as SignatureRequest[] };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível carregar as rodadas de assinatura." };
  }
}

export async function createSignatureInvitationAction(input: {
  contractId: string; documentId: string; signerName: string;
  signerEmail: string; signerPhone?: string;
  sendWhatsapp?: boolean; operatorConfirmedOptIn?: boolean;
  /** Preenchido só quando este convite é um REENVIO de um convite anterior revogado/expirado do mesmo documento/signatário (Item 5, Lote 2, Tarefa 2). */
  previousInvitationId?: string;
}): Promise<Result<{ invitationId: string; urlPath: string; deliveryError?: string }>> {
  const permissionError = await checkFinanceAction("contratos_editar");
  if (permissionError) return { error: permissionError };
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
    if (input.sendWhatsapp && (!signerPhone || !input.operatorConfirmedOptIn)) {
      return { error: "Informe o número e confirme que o destinatário autorizou contato por WhatsApp." };
    }
    if (input.sendWhatsapp && !isWhatsappSignatureTemplateConfigured()) {
      return { error: "Template de convite de assinatura ainda não configurado/aprovado na Meta." };
    }
    const admin = createSupabaseAdminClient();
    const { data: document, error: docError } = await admin.from("contract_documents")
      .select("id,file_reference,contract_id")
      .eq("id", input.documentId).eq("contract_id", input.contractId).maybeSingle();
    if (docError || !document || !String(document.file_reference ?? "").startsWith("contracts/" + input.contractId + "/")) {
      return { error: "Selecione um PDF privado do contrato." };
    }
    let previousInvitationId: string | null = null;
    if (input.previousInvitationId) {
      const { data: previous } = await admin.from("contract_signature_invitations")
        .select("id,document_id,contract_id,status,expires_at")
        .eq("id", input.previousInvitationId).eq("contract_id", input.contractId).eq("document_id", input.documentId)
        .maybeSingle();
      // Só vincula reenvio de um convite que realmente não pode mais ser
      // usado (revogado, ou pending porém já expirado) — nunca de um
      // pending ainda válido ou já signed (isso seria um reenvio sem
      // sentido: o convite anterior ainda funciona ou já foi concluído).
      if (previous && (previous.status === "revoked" ||
          (previous.status === "pending" && Date.parse(previous.expires_at) < Date.now()))) {
        previousInvitationId = previous.id;
      }
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
        notification_channel: input.sendWhatsapp ? "whatsapp" : "manual",
        previous_invitation_id: previousInvitationId,
      }).select("id").single();
    if (error || !data) throw new Error("Não foi possível criar o convite: " + (error?.message ?? ""));
    const urlPath = "/assinar-contrato/" + token;
    let deliveryError: string | undefined;
    if (input.sendWhatsapp && signerPhone) {
      try {
        const { data: contractRow, error: contractError } = await admin
          .from("institutional_contracts")
          .select("contract_number").eq("id", input.contractId).single();
        if (contractError || !contractRow) throw new Error("Número do contrato indisponível.");
        const sent = await sendWhatsappSignatureInviteTemplate({
          toPhone: signerPhone,
          signerName,
          contractNumber: String(contractRow.contract_number || "Informativo Regional"),
          invitationLink: "https://controle.altnix.com.br" + urlPath,
        });
        await admin.from("contract_signature_invitations").update({
          notification_status: "accepted_by_meta",
          notification_message_id: sent.providerMessageId ?? null,
          notification_attempted_at: new Date().toISOString(),
        }).eq("id", data.id);
      } catch (error) {
        deliveryError = error instanceof Error ? error.message : "Falha na API Meta.";
        await admin.from("contract_signature_invitations").update({
          notification_status: "failed", notification_error: deliveryError.slice(0, 600),
          notification_attempted_at: new Date().toISOString(),
        }).eq("id", data.id);
      }
    }
    revalidatePath("/sistema/financeiro/contratos/" + input.contractId);
    // O convite permanece utilizável se a Meta falhar; operador recebe o link.
    return { ok: true, invitationId: data.id, urlPath, deliveryError };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível gerar o convite." };
  }
}

/**
 * Rodada com MÚLTIPLOS signatários pro mesmo documento (Item 5, Lote 2,
 * Tarefa 1) — ex.: um representante da contratante e outro do Jornal
 * IR. Cada signatário recebe um convite INDIVIDUAL (próprio token,
 * próprio estado), mas todos ficam ligados a uma `contract_signature_
 * requests` que só fica "completed" quando TODOS assinarem; o PDF
 * final acumula a evidência de todos (ver claim_signature_turn na
 * migration). Convites criados por `createSignatureInvitationAction`
 * (sem rodada) continuam funcionando exatamente como antes — esta é
 * uma função ADITIVA, não uma substituição.
 */
export async function createSignatureRequestAction(input: {
  contractId: string; documentId: string;
  signers: Array<{ name: string; email: string; phone?: string; sendWhatsapp?: boolean; operatorConfirmedOptIn?: boolean }>;
}): Promise<Result<{
  requestId: string;
  invitations: Array<{ invitationId: string; signerName: string; urlPath: string; deliveryError?: string }>;
}>> {
  const permissionError = await checkFinanceAction("contratos_editar");
  if (permissionError) return { error: permissionError };
  try {
    const actorId = await requireFinanceAccess();
    if (input.signers.length < 2) return { error: "Informe ao menos dois signatários para uma rodada com múltiplos signatários." };
    if (input.signers.length > 10) return { error: "Máximo de 10 signatários por rodada." };

    const normalized = input.signers.map((signer) => {
      const name = signer.name.trim().replace(/\s+/g, " ").slice(0, 180);
      const email = signer.email.trim().toLowerCase().slice(0, 254);
      const phone = (signer.phone ?? "").replace(/\D/g, "");
      return { ...signer, name, email, phone };
    });
    for (const signer of normalized) {
      if (signer.name.length < 3) return { error: "Informe o nome completo de cada signatário." };
      if (!EMAIL_RE.test(signer.email)) return { error: "Informe um e-mail válido para cada signatário (" + signer.name + ")." };
      if (signer.phone && (signer.phone.length < 10 || signer.phone.length > 13)) {
        return { error: "Informe um WhatsApp com DDD válido ou deixe em branco (" + signer.name + ")." };
      }
      if (signer.sendWhatsapp && (!signer.phone || !signer.operatorConfirmedOptIn)) {
        return { error: "Informe o número e confirme a autorização de contato por WhatsApp (" + signer.name + ")." };
      }
      if (signer.sendWhatsapp && !isWhatsappSignatureTemplateConfigured()) {
        return { error: "Template de convite de assinatura ainda não configurado/aprovado na Meta." };
      }
    }
    const distinctEmails = new Set(normalized.map((signer) => signer.email));
    if (distinctEmails.size !== normalized.length) {
      return { error: "Cada signatário desta rodada precisa de um e-mail diferente." };
    }

    const admin = createSupabaseAdminClient();
    const { data: document, error: docError } = await admin.from("contract_documents")
      .select("id,file_reference,contract_id")
      .eq("id", input.documentId).eq("contract_id", input.contractId).maybeSingle();
    if (docError || !document || !String(document.file_reference ?? "").startsWith("contracts/" + input.contractId + "/")) {
      return { error: "Selecione um PDF privado do contrato." };
    }

    const { data: request, error: requestError } = await admin.from("contract_signature_requests")
      .insert({ contract_id: input.contractId, document_id: input.documentId, created_by: actorId })
      .select("id").single();
    if (requestError || !request) throw new Error("Não foi possível criar a rodada de assinatura: " + (requestError?.message ?? ""));

    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    // Token em claro nunca é persistido — cada linha guarda só o hash,
    // e o valor em claro é mantido aqui (memória do processo) só até
    // montar o link devolvido ao operador, na mesma ordem dos tokens.
    const tokens = normalized.map(() => randomBytes(32).toString("hex"));
    const rows = normalized.map((signer, index) => ({
      contract_id: input.contractId, document_id: input.documentId, request_id: request.id,
      signer_name: signer.name, signer_email: signer.email, signer_phone: signer.phone || null,
      token_sha256: hashInvitationToken(tokens[index]),
      created_by: actorId, expires_at: expiresAt,
      notification_channel: signer.sendWhatsapp ? "whatsapp" : "manual",
    }));

    const { data: created, error: insertError } = await admin.from("contract_signature_invitations")
      .insert(rows).select("id,signer_name,signer_email,signer_phone");
    if (insertError || !created || created.length !== rows.length) {
      throw new Error("Não foi possível criar os convites desta rodada: " + (insertError?.message ?? ""));
    }

    const contractNumberRow = await admin.from("institutional_contracts").select("contract_number").eq("id", input.contractId).single();
    const contractNumber = String(contractNumberRow.data?.contract_number || "Informativo Regional");

    const results: Array<{ invitationId: string; signerName: string; urlPath: string; deliveryError?: string }> = [];
    for (let index = 0; index < created.length; index += 1) {
      const row = created[index];
      const signer = normalized[index];
      const urlPath = "/assinar-contrato/" + tokens[index];
      let deliveryError: string | undefined;
      if (signer.sendWhatsapp && signer.phone) {
        try {
          const sent = await sendWhatsappSignatureInviteTemplate({
            toPhone: signer.phone, signerName: signer.name, contractNumber,
            invitationLink: "https://controle.altnix.com.br" + urlPath,
          });
          await admin.from("contract_signature_invitations").update({
            notification_status: "accepted_by_meta",
            notification_message_id: sent.providerMessageId ?? null,
            notification_attempted_at: new Date().toISOString(),
          }).eq("id", row.id);
        } catch (error) {
          deliveryError = error instanceof Error ? error.message : "Falha na API Meta.";
          await admin.from("contract_signature_invitations").update({
            notification_status: "failed", notification_error: deliveryError.slice(0, 600),
            notification_attempted_at: new Date().toISOString(),
          }).eq("id", row.id);
        }
      }
      results.push({ invitationId: row.id, signerName: row.signer_name, urlPath, deliveryError });
    }

    revalidatePath("/sistema/financeiro/contratos/" + input.contractId);
    return { ok: true, requestId: request.id, invitations: results };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível criar a rodada de assinatura." };
  }
}

export async function revokeSignatureInvitationAction(
  contractId: string, invitationId: string,
): Promise<Result<{ revoked: true }>> {
  const permissionError = await checkFinanceAction("contratos_editar");
  if (permissionError) return { error: permissionError };
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
      options: { shouldCreateUser: true, data: { account_purpose: "contract_signer", signature_invitation_id: invitation.id } },
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
    const tokenHash = hashInvitationToken(input.token);
    let source: { filename: string; path: string; contractNumber: string };
    try {
      source = await claimSignatureTurn(invitation, tokenHash);
    } catch (error) {
      if (error instanceof SignatureTurnClaimError) return { error: error.message };
      return { error: "PDF original não encontrado." };
    }
    // A partir daqui o "turno" da rodada (se houver) está reivindicado
    // (claimSignatureTurn acima) — qualquer saída deste bloco, com
    // sucesso ou erro, precisa liberar o mutex, nunca deixar outro
    // signatário esperando os 2 minutos de expiração automática.
    // releaseSignatureTurn é idempotente: se finalize_contract_signature
    // já limpou o lock (sucesso), chamar de novo aqui não faz nada.
    try {
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
      if (downloadError || !original) return { error: "Não foi possível conferir o documento base desta assinatura." };
      const originalBytes = Buffer.from(await original.arrayBuffer());
      if (!originalBytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
        return { error: "O PDF base desta assinatura não está íntegro." };
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
      // source.path é o PDF original NA PRIMEIRA assinatura da rodada, ou
      // o PDF já assinado do signatário anterior nas seguintes (ver
      // claimSignatureTurn) — por isso cada nova folha de evidência se
      // acumula sobre as anteriores, nunca substitui o registro de quem
      // já assinou.
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
        p_invitation_id: invitation.id, p_token_hash: tokenHash,
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
    } finally {
      await releaseSignatureTurn(invitation.id).catch(() => undefined);
    }
  } catch {
    return { error: "Não foi possível finalizar a assinatura. Confira sua conexão ou contate o responsável." };
  }
}
