"use client";

// Bloco B — Cadastro complementar (02/11/2026). Gera o link individual
// seguro; esta tela NUNCA envia o link — a equipe copia e envia
// manualmente pelo canal já confirmado no cadastro. A página pública
// de complementação já existe e exige validação do canal.
import { useState, useTransition } from "react";
import { generateClientCompletionLinkAction } from "../../app/sistema/clientes/complementacao-actions";
import { notify } from "../../lib/feedback/notify";

export function CompletionLinkControl({
  clientId,
  hasWhatsapp,
  hasEmail,
}: {
  clientId: string;
  hasWhatsapp: boolean;
  hasEmail: boolean;
}): JSX.Element {
  const [pending, start] = useTransition();
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  function generate(channel: "whatsapp" | "email"): void {
    start(async () => {
      const result = await generateClientCompletionLinkAction(clientId, channel);
      if ("error" in result) {
        notify.error("Não foi possível gerar o link", result.error);
        return;
      }
      // Caminho relativo isolado não é um link clicável no WhatsApp.
      setGeneratedUrl(new URL(result.urlPath, window.location.origin).href);
      notify.success("Link gerado", `Válido por ${result.expiresInHours}h. Copie e envie manualmente — nenhuma mensagem é enviada automaticamente.`);
    });
  }

  return (
    <section className="form-section">
      <h2>Link de complementação de cadastro</h2>
      <p className="helper-text">
        Gera um link individual e seguro para o próprio interessado completar dados do cadastro. Antes de liberar
        edição, o link exige verificação de posse de um canal já confirmado. O link é válido por 72h, de uso único, e
        esta ação nunca envia nada automaticamente — copie e envie você mesmo pelo WhatsApp ou e-mail já cadastrados.
      </p>
      <div className="materias-toolbar-actions">
        <button type="button" className="form-action-primary" disabled={pending || !hasWhatsapp} onClick={() => generate("whatsapp")}>
          Gerar link (WhatsApp)
        </button>
        <button type="button" className="form-action-primary" disabled={pending || !hasEmail} onClick={() => generate("email")}>
          Gerar link (e-mail)
        </button>
      </div>
      {!hasWhatsapp && !hasEmail ? <p className="helper-text">Cadastre WhatsApp ou e-mail antes de gerar o link.</p> : null}
      {generatedUrl ? (
        <div className="form-section--compact">
          <span className="field-label">Link completo para copiar e enviar ao cliente</span>
          <input readOnly aria-label="Link completo de complementação de cadastro" value={generatedUrl} onFocus={(e) => e.currentTarget.select()} />
          <p className="helper-text">Envie somente ao WhatsApp ou e-mail já cadastrado. Nenhuma mensagem é enviada automaticamente.</p>
        </div>
      ) : null}
    </section>
  );
}
