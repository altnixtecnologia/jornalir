"use client";

import { useState, useTransition } from "react";
import { setClientDigitalExportAction } from "../../app/sistema/clientes/digital-export-actions";
import { notify } from "../../lib/feedback/notify";

export function DigitalExportControl({
  clientId, initiallyEnabled, clientActive,
}: { clientId: string; initiallyEnabled: boolean; clientActive: boolean }): JSX.Element {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [pending, start] = useTransition();
  function change(): void {
    start(async () => {
      const result = await setClientDigitalExportAction(clientId, !enabled);
      if ("error" in result) {
        notify.error("Não foi possível salvar", result.error);
      } else {
        setEnabled(!enabled);
        notify.success(!enabled ? "Pré-autorização registrada" : "Pré-autorização revogada", !enabled
          ? "Registrada para etapa futura. A comunicação com o Altnix segue desligada."
          : "Nenhum dado foi enviado ao Altnix.");
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
  </section>;
}
