"use client";

import { useState, useTransition } from "react";
import { setClientDigitalExportAction } from "../../app/sistema/clientes/digital-export-actions";

export function DigitalExportControl({
  clientId, initiallyEnabled, clientActive,
}: { clientId: string; initiallyEnabled: boolean; clientActive: boolean }): JSX.Element {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  function change(): void {
    setMessage(null);
    start(async () => {
      const result = await setClientDigitalExportAction(clientId, !enabled);
      if ("error" in result) setMessage(result.error);
      else {
        setEnabled(!enabled);
        setMessage(!enabled
          ? "Cadastro liberado para consulta digital. Nenhuma mídia ou cobrança foi modificada."
          : "Autorização revogada. O cadastro não aparece mais na consulta digital.");
      }
    });
  }
  return <section className="form-section">
    <h2>Integração de cadastro digital — Altnix Informativo</h2>
    <p className="helper-text">
      Liberação individual e manual para consulta de identidade, contato e endereço.
      Não cria mídia, contrato, cobrança, playlist, tela ou cadastro no outro sistema.
    </p>
    <p className="helper-text">Estado: <strong>{enabled ? "Liberado para consulta" : "Não liberado"}</strong></p>
    <button type="button" className="form-action-primary"
      disabled={pending || (!enabled && !clientActive)} onClick={change}>
      {pending ? "Salvando..." : enabled ? "Revogar compartilhamento" : "Liberar compartilhamento"}
    </button>
    {!clientActive && !enabled ? <p className="helper-text">Ative o cliente antes de liberar dados.</p> : null}
    {message ? <p role="status" className="helper-text">{message}</p> : null}
  </section>;
}
