"use client";

// Bloco B — Cadastro complementar (02/11/2026). Gera o link individual
// seguro; esta tela NUNCA envia o link — a equipe copia e envia
// manualmente pelo canal já confirmado no cadastro. A página pública que
// consome o token ainda não existe (lote seguinte).
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
  const [generatedPath, setGeneratedPath] = useState<string | null>(null);

  function generate(channel: "whatsapp" | "email"): void {
    start(async () => {
      const result = await generateClientCompletionLinkAction(clientId, channel);
      if ("error" in result) {
        notify.error("Não foi possível gerar o link", result.error);
        return;
      }
      setGeneratedPath(result.urlPath);
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
      {generatedPath ? (
        <div className="form-section--compact">
          <span className="field-label">Caminho gerado (ainda sem página pública nesta etapa):</span>
          <input readOnly value={generatedPath} onFocus={(e) => e.currentTarget.select()} />
        </div>
      ) : null}
    </section>
  );
}
