import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "../supabase/admin";
import { getVerificationUrl } from "./publicVerification";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Modality = "institutional" | "commercial";
type Channel = "email_final" | "telegram_staff";

export interface SignatureDeliveryJob {
  id: string;
  modality: Modality;
  channel: Channel;
  request_id: string | null;
  invitation_id: string | null;
}

class DefiniteDeliveryError extends Error {}
class UncertainDeliveryError extends Error {}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeRecipient(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

interface FinalDocument {
  path: string;
  sha256: string;
  name: string;
  email: string;
  invitationId: string;
}

async function finalDocument(admin: Admin, job: SignatureDeliveryJob): Promise<FinalDocument> {
  if (!job.invitation_id) throw new DefiniteDeliveryError("Convite não identificado.");
  if (job.modality === "commercial") {
    if (!job.request_id) throw new DefiniteDeliveryError("Rodada comercial inválida.");
    const { data: request, error: requestError } = await admin.from("commercial_signature_requests")
      .select("status,final_file_reference,final_sha256")
      .eq("id", job.request_id).maybeSingle();
    if (requestError || !request || request.status !== "completed" ||
      !request.final_file_reference || !request.final_sha256) {
      throw new DefiniteDeliveryError("Documento comercial ainda não está concluído.");
    }
    const { data: invite, error: inviteError } = await admin.from("commercial_signature_invitations")
      .select("status,request_id,commercial_signature_participants(signer_name,signer_email)")
      .eq("id", job.invitation_id).maybeSingle();
    if (inviteError || !invite || invite.status !== "signed" || invite.request_id !== job.request_id) {
      throw new DefiniteDeliveryError("O convite não pertence a esta rodada comercial.");
    }
    const signer = invite.commercial_signature_participants as unknown as { signer_name: string; signer_email: string };
    if (!signer || !safeRecipient(signer.signer_email)) throw new DefiniteDeliveryError("E-mail do signatário inválido.");
    if (!String(request.final_file_reference).startsWith("commercial-signatures/" + job.request_id + "/")) {
      throw new DefiniteDeliveryError("Caminho do PDF comercial não corresponde à rodada.");
    }
    return {
      path: request.final_file_reference,
      sha256: request.final_sha256,
      name: signer.signer_name,
      email: signer.signer_email,
      invitationId: job.invitation_id,
    };
  }

  const { data: invite, error: inviteError } = await admin.from("contract_signature_invitations")
    .select("id,contract_id,request_id,status,signer_name,signer_email,signed_document_id,signed_sha256")
    .eq("id", job.invitation_id).maybeSingle();
  if (inviteError || !invite || invite.status !== "signed" ||
    (job.request_id ?? null) !== (invite.request_id ?? null) ||
    !safeRecipient(invite.signer_email)) {
    throw new DefiniteDeliveryError("Convite institucional não está válido ou concluído.");
  }
  let finalId = invite.signed_document_id;
  let finalSha = invite.signed_sha256;
  if (job.request_id) {
    const { data: request, error } = await admin.from("contract_signature_requests")
      .select("status,final_document_id").eq("id", job.request_id).maybeSingle();
    if (error || !request || request.status !== "completed" || !request.final_document_id) {
      throw new DefiniteDeliveryError("Rodada institucional ainda não está concluída.");
    }
    finalId = request.final_document_id;
    const { data: last, error: lastError } = await admin.from("contract_signature_invitations")
      .select("signed_sha256").eq("request_id",job.request_id)
      .eq("signed_document_id",finalId).maybeSingle();
    if (lastError || !last?.signed_sha256) throw new DefiniteDeliveryError("Hash do PDF institucional final não localizado.");
    finalSha = last.signed_sha256;
  }
  const { data: document, error: documentError } = await admin.from("contract_documents")
    .select("contract_id,file_reference").eq("id", finalId).maybeSingle();
  if (documentError || !document || document.contract_id !== invite.contract_id ||
    !String(document.file_reference).startsWith("contracts/" + invite.contract_id + "/")) {
    throw new DefiniteDeliveryError("Arquivo institucional não pertence ao contrato.");
  }
  return {
    path: document.file_reference,
    sha256: finalSha,
    name: invite.signer_name,
    email: invite.signer_email,
    invitationId: invite.id,
  };
}

async function finalPdfBytes(admin: Admin, document: FinalDocument): Promise<Buffer> {
  const { data, error } = await admin.storage.from("contract-documents").download(document.path);
  if (error || !data) throw new DefiniteDeliveryError("Documento privado indisponível.");
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length < 150 || bytes.length > 10 * 1024 * 1024 ||
      !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
      !/^[0-9a-f]{64}$/.test(document.sha256) ||
      createHash("sha256").update(bytes).digest("hex") !== document.sha256) {
    throw new DefiniteDeliveryError("Integridade do PDF final não confirmada.");
  }
  return bytes;
}

async function sendFinalEmail(admin: Admin, job: SignatureDeliveryJob): Promise<string> {
  const apiKey = process.env.SIGNATURE_EMAIL_API_KEY?.trim();
  const from = process.env.SIGNATURE_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new DefiniteDeliveryError("Provedor de e-mail de assinatura não configurado.");
  const record = await finalDocument(admin, job);
  const pdf = await finalPdfBytes(admin, record);
  const url = getVerificationUrl(job.modality, record.invitationId);
  const name = escapeHtml(record.name);
  const validation = url
    ? `<p>Você pode conferir a integridade do aceite pelo <a href="${escapeHtml(url)}">link de verificação</a> ou pelo QR Code no PDF.</p>`
    : "<p>Guarde o PDF e os comprovantes recebidos para conferência futura.</p>";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f0f3f7;padding:26px;font-family:Arial,sans-serif;color:#1e293b;">
<table role="presentation" style="max-width:620px;width:100%;margin:auto;background:white;border-collapse:collapse;border-radius:10px">
<tr><td style="padding:24px;background:#16385c;color:white"><strong style="font-size:23px">INFORMATIVO REGIONAL</strong><div style="margin-top:5px;font-size:13px">Documentos e contratos</div></td></tr>
<tr><td style="padding:28px"><p>Olá, ${name}.</p>
<h1 style="font-size:22px;color:#16385c">Seu documento foi concluído</h1>
<p>Encaminhamos em anexo o PDF consolidado após as assinaturas previstas para esta rodada. Guarde esta cópia para consulta.</p>
${validation}
<p style="font-size:13px;color:#64748b">Esta mensagem é transacional, referente a um documento já assinado. Não solicita senha, CPF, pagamentos ou novos aceites.</p>
<p style="font-size:13px;color:#64748b">Informativo Regional</p>
</td></tr></table></body></html>`;
  const body = {
    from,
    to: [record.email],
    subject: "Documento concluído - Informativo Regional",
    html,
    attachments: [{ filename: "contrato-assinado.pdf", content: pdf.toString("base64") }],
  };
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new UncertainDeliveryError("Resposta do provedor de e-mail não confirmada.");
  }
  if (!response.ok) {
    const message = "E-mail retornou HTTP " + response.status;
    if (response.status >= 500 || response.status === 429) throw new UncertainDeliveryError(message);
    throw new DefiniteDeliveryError(message);
  }
  const json = await response.json().catch(() => null) as { id?: string } | null;
  if (!json?.id) throw new UncertainDeliveryError("E-mail sem identificador de confirmação.");
  return json.id;
}

async function sendStaffTelegram(job: SignatureDeliveryJob): Promise<string> {
  const token = process.env.CONTRACTS_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.CONTRACTS_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) throw new DefiniteDeliveryError("Telegram de contratos não configurado.");
  if (!job.request_id && !job.invitation_id) throw new DefiniteDeliveryError("Evento sem referência.");
  const label = job.modality === "commercial" ? "Comercial" : "Institucional";
  // Sem nome, CPF, e-mail, link de acesso a PDF ou token de assinatura.
  const text = `Informativo Regional | Contrato ${label}\nRodada de assinaturas concluída.\nReferência interna: ${(job.request_id ?? job.invitation_id)?.slice(0,8)}\nPDF e comprovantes disponíveis no sistema administrativo.`;
  let response: Response;
  try {
    response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new UncertainDeliveryError("Resposta do Telegram não confirmada.");
  }
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) throw new UncertainDeliveryError("Telegram HTTP " + response.status);
    throw new DefiniteDeliveryError("Telegram HTTP " + response.status);
  }
  const result = await response.json().catch(() => null) as { ok?: boolean; result?: { message_id?: number } } | null;
  if (!result?.ok || !Number.isInteger(result.result?.message_id)) {
    throw new UncertainDeliveryError("Telegram não confirmou identificador da mensagem.");
  }
  return String(result.result?.message_id);
}

/** Conclusão é persistida em RPC; falha incerta nunca resulta em reenvio automático. */
export async function processSignatureDeliveryJob(admin: Admin, job: SignatureDeliveryJob): Promise<"sent" | "failed" | "uncertain"> {
  let state: "sent" | "failed" | "uncertain" = "failed";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    providerId = job.channel === "email_final"
      ? await sendFinalEmail(admin, job)
      : await sendStaffTelegram(job);
    state = "sent";
  } catch (cause) {
    state = cause instanceof UncertainDeliveryError ? "uncertain" : "failed";
    error = cause instanceof Error ? cause.message.slice(0, 300) : "Falha de entrega.";
  }
  const { error: finishError } = await admin.rpc("finish_contract_signature_delivery", {
    p_id: job.id, p_status: state, p_provider_id: providerId, p_error: error,
  });
  if (finishError) {
    // O provedor pode ter enviado: NÃO reenviar automaticamente.
    throw new Error("Estado da entrega não persistido. Reconciliação manual necessária.");
  }
  return state;
}

export function signatureDeliveryEnabled(): boolean {
  return process.env.SIGNATURE_DELIVERY_ENABLED === "true";
}
