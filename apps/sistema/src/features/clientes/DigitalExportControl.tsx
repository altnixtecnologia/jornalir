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
          ? "Pré-autorização registrada para etapa futura. A comunicação com o Altnix segue desligada."
          : "Pré-autorização revogada. Nenhum dado foi enviado ao Altnix.");
      }
    });
  }
  return <section className="form-section">
    <h2>Integração de cadastro digital — Altnix Informativo</h2>
    <p className="helper-text">
      Apenas registra a pré-autorização interna de identidade, contato e endereço para uma etapa futura.
      A integração com o Altnix Informativo está DESLIGADA, mesmo com pré-autorização.
      Não envia dados nem cria mídia, contrato, cobrança, playlist ou equipamento.
    </p>
    <p className="helper-text">Estado: <strong>{enabled ? "Pré-autorizado; conexão desligada" : "Sem pré-autorização; conexão desligada"}</strong></p>
    <button type="button" className="form-action-primary"
      disabled={pending || (!enabled && !clientActive)} onClick={change}>
      {pending ? "Salvando..." : enabled ? "Revogar pré-autorização" : "Pré-autorizar para integração futura"}
    </button>
    {!clientActive && !enabled ? <p className="helper-text">Ative o cliente antes de liberar dados.</p> : null}
    {message ? <p role="status" className="helper-text">{message}</p> : null}
  </section>;
}
