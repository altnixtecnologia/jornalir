"use client";

import { useMemo, useState, useTransition } from "react";
import type { ContractDocument } from "@ir/types";
import {
  createSignatureInvitationAction, createSignatureRequestAction, revokeSignatureInvitationAction,
  type PublicSignatureInvite, type SignatureRequest,
} from "../../app/sistema/financeiro/contratos/signature-actions";
import { notify } from "../../lib/feedback/notify";

type DraftSigner = { name: string; email: string; phone: string };

function requestStatusLabel(status: SignatureRequest["status"]): string {
  if (status === "completed") return "Concluída — todos assinaram";
  if (status === "cancelled") return "Cancelada";
  return "Em andamento";
}

export function ContractSignaturesPanel({
  contractId, documents, invitations, requests = [], whatsappEnabled = false,
}: {
  contractId: string;
  documents: ContractDocument[];
  invitations: PublicSignatureInvite[];
  requests?: SignatureRequest[];
  whatsappEnabled?: boolean;
}): JSX.Element {
  const eligible = useMemo(
    () => documents.filter((item) =>
      item.fileReference?.startsWith("contracts/" + contractId + "/") &&
      !item.name.startsWith("Comprovante de assinatura")),
    [documents, contractId],
  );
  const [documentId, setDocumentId] = useState(eligible[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();
  const [localInvites, setLocalInvites] = useState(invitations);
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [createdInvitePhone, setCreatedInvitePhone] = useState("");
  const [createdInviteEmail, setCreatedInviteEmail] = useState("");
  const [multiMode, setMultiMode] = useState(false);
  const [draftSigners, setDraftSigners] = useState<DraftSigner[]>([]);
  const [localRequests, setLocalRequests] = useState(requests);
  const [resendOf, setResendOf] = useState("");
  const [requestLinks, setRequestLinks] = useState<Array<{ signerName: string; urlPath: string; deliveryError?: string }>>([]);

  function addDraftSigner(): void {
    if (!name.trim() || !email.trim()) { setError("Informe nome e e-mail do signatário antes de adicionar."); return; }
    if (draftSigners.some((signer) => signer.email.trim().toLowerCase() === email.trim().toLowerCase())) {
      setError("Já há um signatário com este e-mail nesta rodada.");
      return;
    }
    setError("");
    setDraftSigners((old) => [...old, { name: name.trim(), email: email.trim(), phone: phone.trim() }]);
    setName(""); setEmail(""); setPhone("");
  }

  function removeDraftSigner(index: number): void {
    setDraftSigners((old) => old.filter((_, i) => i !== index));
  }

  function sendSignatureRequest(): void {
    setRequestLinks([]);
    startTransition(async () => {
      try {
        const result = await createSignatureRequestAction({
          contractId, documentId,
          signers: draftSigners.map((signer) => ({
            name: signer.name, email: signer.email, phone: signer.phone,
            sendWhatsapp: sendWhatsapp && Boolean(signer.phone), operatorConfirmedOptIn: whatsappOptIn,
          })),
        });
        if ("error" in result) { notify.error("Rodada não criada", result.error); return; }
        const failedDeliveries = result.invitations.filter((item) => item.deliveryError);
        if (failedDeliveries.length > 0) {
          notify.warning("Rodada criada, envio automático falhou",
            "Rodada criada, mas o envio automático falhou para: " + failedDeliveries.map((item) => item.signerName).join(", ") +
            ". Compartilhe o link manualmente com essas pessoas.");
        } else {
          notify.success("Rodada de assinatura criada",
            sendWhatsapp ? "Os convites foram aceitos para envio por WhatsApp." : "Os links de assinatura foram gerados.");
        }
        setRequestLinks(result.invitations.map((item) => ({
          signerName: item.signerName, urlPath: item.urlPath, deliveryError: item.deliveryError,
        })));
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
        setLocalRequests((old) => [{
          id: result.requestId, contract_id: contractId, document_id: documentId,
          status: "pending", final_document_id: null, created_at: now, completed_at: null,
        }, ...old]);
        setLocalInvites((old) => [
          ...result.invitations.map((item, index) => ({
            id: item.invitationId, contract_id: contractId, document_id: documentId, request_id: result.requestId,
            previous_invitation_id: null,
            signer_name: item.signerName, signer_email: draftSigners[index]?.email ?? "", signer_phone: draftSigners[index]?.phone ?? "",
            status: "pending" as const, expires_at: expiresAt,
            notification_channel: (sendWhatsapp && draftSigners[index]?.phone ? "whatsapp" : "manual") as "whatsapp" | "manual",
            notification_status: (sendWhatsapp && draftSigners[index]?.phone ? (item.deliveryError ? "failed" : "accepted_by_meta") : "not_sent") as "not_sent" | "accepted_by_meta" | "failed",
            created_at: now, signed_at: null, receipt_document_id: null, signed_document_id: null,
          })),
          ...old,
        ]);
        setDraftSigners([]);
        setMultiMode(false);
        setSendWhatsapp(false); setWhatsappOptIn(false);
      } catch { setError("Não foi possível criar a rodada de assinatura. Tente novamente."); }
    });
  }

  function sendInvite(): void {
    setInviteLink("");
    startTransition(async () => {
      try {
        const result = await createSignatureInvitationAction({
          contractId, documentId, signerName: name, signerEmail: email, signerPhone: phone,
          sendWhatsapp, operatorConfirmedOptIn: whatsappOptIn,
          previousInvitationId: resendOf || undefined,
        });
        if ("error" in result) { notify.error("Convite não gerado", result.error); return; }
        setInviteLink(window.location.origin + result.urlPath);
        if (result.deliveryError) {
          notify.warning("Convite criado, envio automático falhou", "Convite criado, mas o envio automático falhou: " + result.deliveryError + ". Compartilhe o link manualmente.");
        } else {
          notify.success("Convite gerado", sendWhatsapp ? "O convite foi aceito para envio por WhatsApp." : "O link de assinatura foi gerado.");
        }
        setCreatedInvitePhone(phone.replace(/\D/g, ""));
        setCreatedInviteEmail(email.trim());
        setCopied(false);
        setLocalInvites((old) => [{
          id: result.invitationId, contract_id: contractId, document_id: documentId, request_id: null,
          previous_invitation_id: resendOf || null,
          signer_name: name.trim(), signer_email: email.trim(), signer_phone: phone.trim(),
          status: "pending", expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          notification_channel: sendWhatsapp ? "whatsapp" : "manual",
          notification_status: sendWhatsapp && !result.deliveryError ? "accepted_by_meta" : sendWhatsapp ? "failed" : "not_sent",
          created_at: new Date().toISOString(), signed_at: null, receipt_document_id: null, signed_document_id: null,
        }, ...old]);
        setName(""); setEmail(""); setPhone(""); setSendWhatsapp(false); setWhatsappOptIn(false); setResendOf("");
      } catch { notify.error("Convite não gerado", "Não foi possível gerar o convite. Tente novamente."); }
    });
  }

  function revoke(invitationId: string): void {
    if (!window.confirm("Revogar este convite? O link deixará de funcionar.")) return;
    startTransition(async () => {
      try {
        const result = await revokeSignatureInvitationAction(contractId, invitationId);
        if ("error" in result) { notify.error("Convite não revogado", result.error); return; }
        setLocalInvites((old) => old.map((i) => i.id === invitationId ? { ...i, status: "revoked" } : i));
        notify.success("Convite revogado", "O link deixou de funcionar.");
      } catch { notify.error("Convite não revogado", "Não foi possível revogar o convite."); }
    });
  }

  const whatsappLink = createdInvitePhone;
  return (
    <section className="form-section">
      <h2>Assinatura eletrônica</h2>
      <p className="helper-text">
        O signatário confere o PDF original e desenha a assinatura no navegador.
        O aceite gera um comprovante separado com data e SHA-256 do original.
        Nenhum convite é enviado automaticamente; compartilhe o link somente com o destinatário correto.
      </p>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {eligible.length === 0 ? (
        <p className="helper-text">Anexe primeiro um PDF privado ao contrato para gerar um convite.</p>
      ) : (
        <div className="form-grid">
          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={multiMode}
                onChange={(e) => { setMultiMode(e.target.checked); setDraftSigners([]); setError(""); }} />
              Este documento precisa de múltiplos signatários (ex.: representante da contratante e do Jornal IR)
            </label>
          </div>
          <label className="form-field">
            <span className="field-label">Documento para assinatura</span>
            <select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              {eligible.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          {multiMode && draftSigners.length > 0 ? (
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Signatários desta rodada ({draftSigners.length})</span>
              <ul className="destaques-list">
                {draftSigners.map((signer, index) => (
                  <li className="destaques-item" key={signer.email}>
                    <div className="destaques-item-body">
                      <span className="materia-title">{signer.name}</span>
                      <span className="helper-text">{signer.email}{signer.phone ? " · " + signer.phone : ""}</span>
                    </div>
                    <button type="button" onClick={() => removeDraftSigner(index)}>Remover</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <label className="form-field">
            <span className="field-label">Nome completo do signatário</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={180} />
          </label>
          <label className="form-field">
            <span className="field-label">E-mail do signatário</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
          </label>
          <label className="form-field">
            <span className="field-label">WhatsApp com DDD (opcional)</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="48 99999-9999" />
          </label>
          {whatsappEnabled ? (
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={sendWhatsapp}
                  onChange={(e) => setSendWhatsapp(e.target.checked)} />
                Enviar convite automaticamente pelo template aprovado na Meta
              </label>
              {sendWhatsapp ? <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={whatsappOptIn}
                  onChange={(e) => setWhatsappOptIn(e.target.checked)} />
                Confirmo que o destinatário autorizou receber este convite no WhatsApp.
              </label> : null}
            </div>
          ) : <p className="helper-text" style={{ gridColumn: "1 / -1" }}>
            Envio automático indisponível: configure e aprove o template de convite no WhatsApp Business.
            Por enquanto, compartilhe o link manualmente.
          </p>}
          <div className="form-actions">
            {multiMode ? (
              <>
                <button type="button" onClick={addDraftSigner}
                  disabled={pending || !name.trim() || !email.trim() || (sendWhatsapp && (!whatsappOptIn || !phone.trim()))}>
                  + Adicionar signatário à rodada
                </button>
                <button type="button" className="form-action-primary" onClick={sendSignatureRequest}
                  disabled={pending || !documentId || draftSigners.length < 2}>
                  {pending ? "Processando…" : "Criar rodada com " + draftSigners.length + " signatário(s)"}
                </button>
              </>
            ) : (
              <button type="button" className="form-action-primary" onClick={sendInvite}
                disabled={pending || !documentId || !name.trim() || !email.trim() || (sendWhatsapp && (!whatsappOptIn || !phone.trim()))}>
                {pending ? "Processando…" : "+ Criar convite de assinatura"}
              </button>
            )}
          </div>
          {multiMode ? <p className="helper-text" style={{ gridColumn: "1 / -1" }}>
            Adicione pelo menos dois signatários antes de criar a rodada. O documento final só fica disponível depois que TODOS assinarem,
            e reúne a evidência de cada um — nunca apenas a do último a assinar.
          </p> : null}
        </div>
      )}
      {requestLinks.length > 0 ? (
        <div className="inline-form" style={{ marginTop: 12 }}>
          <p className="helper-text"><strong>Rodada criada.</strong> Salve e compartilhe cada link agora, somente com o respectivo destinatário: eles não poderão ser recuperados depois.</p>
          <ul className="destaques-list">
            {requestLinks.map((link) => (
              <li className="destaques-item" key={link.urlPath}>
                <div className="destaques-item-body">
                  <span className="materia-title">{link.signerName}</span>
                  <input readOnly value={window.location.origin + link.urlPath} aria-label={"Link privado de assinatura de " + link.signerName} />
                  {link.deliveryError ? <span className="form-error">Envio automático falhou: {link.deliveryError}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {inviteLink ? (
        <div className="inline-form" style={{ marginTop: 12 }}>
          <p className="helper-text"><strong>Convite criado.</strong> Salve e compartilhe este link agora: ele não poderá ser recuperado depois.</p>
          <input readOnly value={inviteLink} aria-label="Link privado de assinatura" />
          <div className="form-actions">
            <button type="button" onClick={() => void navigator.clipboard.writeText(inviteLink).then(() => setCopied(true))}>
              {copied ? "Copiado" : "Copiar link"}
            </button>
            {whatsappLink ? <a target="_blank" rel="noopener noreferrer"
              href={"https://wa.me/" + (whatsappLink.startsWith("55") ? whatsappLink : "55" + whatsappLink) +
                "?text=" + encodeURIComponent("Olá! Segue seu convite privado para conferir e assinar o documento: " + inviteLink)}>
              Compartilhar no WhatsApp
            </a> : null}
            <a href={"mailto:" + encodeURIComponent(createdInviteEmail) + "?subject=" + encodeURIComponent("Convite para assinatura de documento") +
              "&body=" + encodeURIComponent("Confira e assine o documento neste link privado: " + inviteLink)}>
              Preparar e-mail
            </a>
          </div>
        </div>
      ) : null}
      {localRequests.length > 0 ? (
        <>
          <h3 style={{ marginTop: 20 }}>Rodadas com múltiplos signatários</h3>
          <ul className="destaques-list">
            {localRequests.map((request) => {
              const signers = localInvites.filter((invite) => invite.request_id === request.id);
              const signedCount = signers.filter((invite) => invite.status === "signed").length;
              return <li className="destaques-item" key={request.id}>
                <div className="destaques-item-body">
                  <span className="materia-title">{requestStatusLabel(request.status)} — {signedCount} de {signers.length} assinaram</span>
                  <span className="helper-text">Criada em {new Date(request.created_at).toLocaleDateString("pt-BR")}</span>
                  {request.final_document_id ? <a className="materia-title-link"
                    href={"/api/financeiro/contratos/" + contractId + "/documentos/" + request.final_document_id}
                    target="_blank" rel="noopener noreferrer">Abrir documento final consolidado (todos os signatários)</a> : null}
                </div>
              </li>;
            })}
          </ul>
        </>
      ) : null}
      <h3 style={{ marginTop: 20 }}>Histórico de convites</h3>
      {localInvites.length === 0 ? <p className="helper-text">Nenhum convite criado ainda.</p> : (
        <ul className="destaques-list">
          {localInvites.map((invite) => {
            const expired = invite.status === "pending" && Date.parse(invite.expires_at) < Date.now();
            return <li className="destaques-item" key={invite.id}>
              <div className="destaques-item-body">
                <span className="materia-title">{invite.signer_name}{invite.request_id ? " · rodada com múltiplos signatários" : ""}{invite.previous_invitation_id ? " · reenvio" : ""}</span>
                <span className="helper-text">
                  {invite.signer_email} · {invite.notification_status === "accepted_by_meta" ? "Envio aceito pela Meta · " : invite.notification_status === "failed" ? "Falha no envio automático · " : ""}{invite.status === "signed" ? "Assinado" :
                    invite.status === "revoked" ? "Revogado" : expired ? "Expirado" : "Aguardando assinatura"} ·
                  {" "}{new Date(invite.created_at).toLocaleDateString("pt-BR")}
                </span>
                {invite.signed_at ? <span className="helper-text">
                  Aceite: {new Date(invite.signed_at).toLocaleString("pt-BR")}
                </span> : null}
                {invite.signed_document_id ? <a className="materia-title-link"
                  href={"/api/financeiro/contratos/" + contractId + "/documentos/" + invite.signed_document_id}
                  target="_blank" rel="noopener noreferrer">Abrir PDF com assinatura</a> : null}
                {invite.receipt_document_id ? <a className="materia-title-link"
                  href={"/api/financeiro/contratos/" + contractId + "/documentos/" + invite.receipt_document_id}
                  target="_blank" rel="noopener noreferrer">Abrir comprovante PDF</a> : null}
              </div>
              {invite.status === "pending" && !expired ? (
                <button type="button" disabled={pending} onClick={() => revoke(invite.id)}>Revogar</button>
              ) : (expired || invite.status === "revoked") ? (
                <button type="button" disabled={pending} onClick={() => {
                  setMultiMode(false);
                  setDocumentId(invite.document_id);
                  setName(invite.signer_name);
                  setEmail(invite.signer_email);
                  setPhone(invite.signer_phone ?? "");
                  setInviteLink("");
                  setError("");
                  setResendOf(invite.id);
                }}>Preparar novo convite (reenvio)</button>
              ) : null}
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
