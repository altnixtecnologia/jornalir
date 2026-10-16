"use client";

import { useMemo, useState, useTransition } from "react";
import type { ContractDocument } from "@ir/types";
import {
  createSignatureInvitationAction, revokeSignatureInvitationAction,
  type PublicSignatureInvite,
} from "../../app/sistema/financeiro/contratos/signature-actions";

export function ContractSignaturesPanel({
  contractId, documents, invitations,
}: {
  contractId: string;
  documents: ContractDocument[];
  invitations: PublicSignatureInvite[];
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
  const [createdInvitePhone, setCreatedInvitePhone] = useState("");
  const [createdInviteEmail, setCreatedInviteEmail] = useState("");

  function sendInvite(): void {
    setError("");
    setInviteLink("");
    startTransition(async () => {
      try {
        const result = await createSignatureInvitationAction({
          contractId, documentId, signerName: name, signerEmail: email, signerPhone: phone,
        });
        if ("error" in result) { setError(result.error); return; }
        setInviteLink(window.location.origin + result.urlPath);
        setCreatedInvitePhone(phone.replace(/\D/g, ""));
        setCreatedInviteEmail(email.trim());
        setCopied(false);
        setLocalInvites((old) => [{
          id: result.invitationId, contract_id: contractId, document_id: documentId,
          signer_name: name.trim(), signer_email: email.trim(), signer_phone: phone.trim(),
          status: "pending", expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          created_at: new Date().toISOString(), signed_at: null, receipt_document_id: null,
        }, ...old]);
        setName(""); setEmail(""); setPhone("");
      } catch { setError("Não foi possível gerar o convite. Tente novamente."); }
    });
  }

  function revoke(invitationId: string): void {
    if (!window.confirm("Revogar este convite? O link deixará de funcionar.")) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await revokeSignatureInvitationAction(contractId, invitationId);
        if ("error" in result) { setError(result.error); return; }
        setLocalInvites((old) => old.map((i) => i.id === invitationId ? { ...i, status: "revoked" } : i));
      } catch { setError("Não foi possível revogar o convite."); }
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
          <label className="form-field">
            <span className="field-label">Documento para assinatura</span>
            <select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              {eligible.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
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
          <div className="form-actions">
            <button type="button" className="form-action-primary" onClick={sendInvite}
              disabled={pending || !documentId || !name.trim() || !email.trim()}>
              {pending ? "Processando…" : "+ Criar convite de assinatura"}
            </button>
          </div>
        </div>
      )}
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
      <h3 style={{ marginTop: 20 }}>Histórico de convites</h3>
      {localInvites.length === 0 ? <p className="helper-text">Nenhum convite criado ainda.</p> : (
        <ul className="destaques-list">
          {localInvites.map((invite) => {
            const expired = invite.status === "pending" && Date.parse(invite.expires_at) < Date.now();
            return <li className="destaques-item" key={invite.id}>
              <div className="destaques-item-body">
                <span className="materia-title">{invite.signer_name}</span>
                <span className="helper-text">
                  {invite.signer_email} · {invite.status === "signed" ? "Assinado" :
                    invite.status === "revoked" ? "Revogado" : expired ? "Expirado" : "Aguardando assinatura"} ·
                  {" "}{new Date(invite.created_at).toLocaleDateString("pt-BR")}
                </span>
                {invite.signed_at ? <span className="helper-text">
                  Aceite: {new Date(invite.signed_at).toLocaleString("pt-BR")}
                </span> : null}
                {invite.receipt_document_id ? <a className="materia-title-link"
                  href={"/api/financeiro/contratos/" + contractId + "/documentos/" + invite.receipt_document_id}
                  target="_blank" rel="noopener noreferrer">Abrir comprovante PDF</a> : null}
              </div>
              {invite.status === "pending" && !expired ? (
                <button type="button" disabled={pending} onClick={() => revoke(invite.id)}>Revogar</button>
              ) : null}
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
