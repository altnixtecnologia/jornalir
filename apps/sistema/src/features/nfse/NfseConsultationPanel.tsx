"use client";

import { useState, useTransition } from "react";
import { consultNfseByAccessKeyAction } from "../../app/sistema/nfse/notas/[id]/query-actions";

/**
 * Consulta da NFS-e pela chave de acesso no Sistema Nacional (Bloco B,
 * item 4, 25/10/2026) — chama o caminho real (`TransmissionService.
 * consultNfseByAccessKey`), que continua bloqueado por
 * `RealTransmissionNotReadyError` nesta fase (ver
 * national-nfse-provider.ts). Existe pra deixar a interface
 * tecnicamente completa (nunca pra contornar o bloqueio): o botão já
 * chama exatamente o caminho que vai funcionar quando a transmissão
 * real for religada, sem precisar de nenhuma tela nova depois.
 */
export function NfseConsultationPanel({ accessKey }: { accessKey: string | undefined }): JSX.Element {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [xml, setXml] = useState<string | null>(null);

  function consult(): void {
    if (!accessKey) return;
    setError(null);
    setXml(null);
    startTransition(async () => {
      const result = await consultNfseByAccessKeyAction(accessKey);
      if ("error" in result) { setError(result.error); return; }
      setXml(result.xml);
    });
  }

  if (!accessKey) return <></>;

  return (
    <section className="form-section">
      <h2>Consulta no Sistema Nacional</h2>
      <p className="helper-text">
        Consulta a NFS-e diretamente no Sistema Nacional pela chave de acesso — útil pra confirmar o estado oficial da nota
        independente do que está registrado localmente. A transmissão/consulta real está bloqueada nesta fase (ver mensagem abaixo).
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {xml ? (
        <pre className="helper-text" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{xml}</pre>
      ) : null}
      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={consult} disabled={pending}>
          {pending ? "Consultando…" : "Consultar pela chave de acesso"}
        </button>
      </div>
    </section>
  );
}
