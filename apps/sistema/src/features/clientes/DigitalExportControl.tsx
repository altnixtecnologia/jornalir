"use client";

import { useState, useTransition } from "react";
import { setClientDigitalExportAction } from "../../app/sistema/clientes/digital-export-actions";
import { notify } from "../../lib/feedback/notify";

/** A seleção do serviço é a própria autorização cadastral, sem uma
 * segunda aprovação. Reutiliza a tabela e o RPC auditado existentes. */
export function DigitalExportControl({
  clientId, initiallyEnabled, clientActive,
}: { clientId: string; initiallyEnabled: boolean; clientActive: boolean }): JSX.Element {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [pending, start] = useTransition();
  function change(next: boolean): void {
    if (pending || (next && !clientActive) || next === enabled) return;
    start(async () => {
      const result = await setClientDigitalExportAction(clientId, next);
      if ("error" in result) {
        notify.error("Não foi possível salvar o serviço", result.error);
      } else {
        setEnabled(next);
        notify.success(next ? "Altnix Informativo vinculado" : "Altnix Informativo desvinculado",
          next ? "Cadastro disponível para consulta quando a integração estiver habilitada."
          : "Novas consultas cadastrais pelo serviço deixam de ser autorizadas.");
      }
    });
  }
  return <section className="form-section">
    <h2>Serviços digitais vinculados</h2>
    <p className="helper-text">
      Selecione os serviços utilizados pelo cliente. O cadastro principal permanece no Jornal IR.
      A seleção permite compartilhar somente os dados cadastrais necessários, sem criar contratos,
      cobranças, mídias ou equipamentos e sem alterar operações existentes.
    </p>
    <label>
      <input type="checkbox" checked={enabled}
        disabled={pending || (!enabled && !clientActive)}
        onChange={(event) => change(event.target.checked)} />
      {" "}Altnix Informativo
    </label>
    {pending ? <p className="helper-text" role="status">Salvando...</p> : null}
    {!clientActive && !enabled ? <p className="helper-text">Ative o cadastro antes de vincular o serviço.</p> : null}
  </section>;
}
