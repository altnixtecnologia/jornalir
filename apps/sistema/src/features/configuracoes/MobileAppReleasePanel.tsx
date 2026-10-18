"use client";

import { useState, useTransition } from "react";
import { saveAndroidAppReleaseAction } from "../../app/sistema/configuracoes/aplicativo/actions";

type Props = {
  initial: {
    versionLabel: string; versionCode: number; published: boolean;
    apkUrl: string; sha256: string; fileSizeBytes: string;
    releaseNotes: string; publishedAt: string | null;
  };
};

export function MobileAppReleasePanel({ initial }: Props): JSX.Element {
  const [versionLabel, setVersionLabel] = useState(initial.versionLabel);
  const [versionCode, setVersionCode] = useState(String(initial.versionCode));
  const [apkUrl, setApkUrl] = useState(initial.apkUrl);
  const [sha256, setSha256] = useState(initial.sha256);
  const [size, setSize] = useState(initial.fileSizeBytes);
  const [notes, setNotes] = useState(initial.releaseNotes);
  const [published, setPublished] = useState(initial.published);
  const [confirmed, setConfirmed] = useState(initial.published);
  const [currentUrl, setCurrentUrl] = useState(initial.published ? initial.apkUrl : "");
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();

  function save(nextPublished: boolean): void {
    if (nextPublished && !window.confirm("Confirmar que o APK foi testado e está pronto para download público?")) return;
    setMessage("");
    startTransition(async () => {
      const result = await saveAndroidAppReleaseAction({
        versionLabel, versionCode: Number(versionCode), apkUrl, sha256,
        fileSizeBytes: size, releaseNotes: notes, published: nextPublished,
      });
      if ("error" in result) {
        setMessage(result.error);
        return;
      }
      setPublished(nextPublished);
      setConfirmed(nextPublished);
      setCurrentUrl(nextPublished ? apkUrl : "");
      setMessage(nextPublished ? "Versão liberada para download." : "Informações salvas. Download desativado.");
    });
  }

  return (
    <section className="form-section form-section--first">
      <h2>Android — Piloto</h2>
      <p className="helper-text">A página pública é <a href="https://jornalir.vercel.app/aplicativo" target="_blank" rel="noreferrer" className="materia-title-link">/aplicativo</a>. Nenhum APK é anunciado enquanto o status estiver desativado.</p>
      <div className="form-grid">
        <label><span className="field-label">Versão exibida</span>
          <input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="v.00.00" disabled={busy}/></label>
        <label><span className="field-label">Código interno Android</span>
          <input type="number" min="1" value={versionCode} onChange={(e) => setVersionCode(e.target.value)} disabled={busy}/></label>
        <label><span className="field-label">Link HTTPS do APK no R2</span>
          <input type="url" value={apkUrl} onChange={(e) => setApkUrl(e.target.value)} placeholder="https://.../jornal-ir.apk" disabled={busy}/></label>
        <label><span className="field-label">Tamanho do APK (bytes)</span>
          <input type="number" min="1" value={size} onChange={(e) => setSize(e.target.value)} placeholder="Ex.: 12345678" disabled={busy}/></label>
        <label><span className="field-label">SHA-256 do arquivo (64 caracteres)</span>
          <input value={sha256} onChange={(e) => setSha256(e.target.value)} maxLength={64} disabled={busy}/></label>
        <label><span className="field-label">Novidades da versão</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy}/></label>
      </div>
      <p className="helper-text">Situação atual: <strong>{confirmed ? "Publicado para download" : "Em preparação / download desativado"}</strong>.</p>
      {currentUrl && confirmed ? <p><a href={currentUrl} target="_blank" rel="noreferrer" className="materia-title-link">Baixar o APK publicado</a></p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="form-action-primary" disabled={busy} onClick={() => save(false)}>Salvar e deixar desativado</button>
        <button type="button" className="form-action-primary" disabled={busy} onClick={() => save(true)}>{published ? "Atualizar versão disponível" : "Liberar APK para download"}</button>
      </div>
      {message ? <p role="status" className="helper-text">{message}</p> : null}
      <p className="helper-text">O link só será liberado depois que o APK real for enviado ao R2 e conferido. A página pública acompanha o registro do Supabase sem novo deploy.</p>
    </section>
  );
}
