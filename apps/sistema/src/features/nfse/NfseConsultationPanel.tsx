"use client";

import { useState, useTransition } from "react";
import { consultNfseByNoteIdAction } from "../../app/sistema/nfse/notas/[id]/query-actions";

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
export function NfseConsultationPanel({ noteId, accessKey, previewMode = false }: { noteId: string; accessKey: string | undefined; previewMode?: boolean }): JSX.Element {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [source, setSource] = useState<"demonstration" | "official" | null>(null);

  function consult(): void {
    if (!accessKey && !previewMode) return;
    setError(null);
    setXml(null);
    setSource(null);
    startTransition(async () => {
      const result = await consultNfseByNoteIdAction(noteId);
      if ("error" in result) { setError(result.error); return; }
      setXml(result.xml);
      setSource(result.source);
    });
  }

  if (!accessKey && !previewMode) return <></>;

  return (
    <section className="form-section">
      <h2>{previewMode ? "Consulta local (demonstração)" : "Consulta no Sistema Nacional"}</h2>
      <p className="helper-text">
        {previewMode
          ? "Exibe apenas o XML fictício armazenado no modo demonstração; não consulta a Receita Federal nem confirma autorização fiscal."
          : "Consulta a nota pela sua chave oficial registrada no sistema. A consulta real permanece bloqueada até a homologação."}
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {source === "demonstration" ? (
        <p className="form-error" role="status">DEMONSTRAÇÃO — dados fictícios, sem consulta à SEFIN e sem valor fiscal.</p>
      ) : null}
      {source === "official" ? (
        <p className="helper-text" role="status">XML obtido do Sistema Nacional.</p>
      ) : null}
      {xml ? (
        <pre className="helper-text" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{xml}</pre>
      ) : null}
      <div className="form-actions">
        <button type="button" className="form-action-primary" onClick={consult} disabled={pending}>
          {pending ? "Consultando…" : previewMode ? "Ver XML fictício" : "Consultar nota no Sistema Nacional"}
        </button>
      </div>
    </section>
  );
}
