"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  SiteAdFitMode,
  SiteAdSlotTransitionEffect,
  SiteAdSlotWithMedia,
} from "@ir/types";
import {
  SITE_AD_FIT_MODE_LABELS,
  SITE_AD_SLOT_TRANSITION_EFFECT_LABELS,
  SITE_AD_SLOT_TRANSITION_EFFECTS,
} from "@ir/types";
import {
  removeSiteAdMediaAction,
  reorderSiteAdMediaAction,
  toggleSiteAdSlotActiveAction,
  updateSiteAdSlotSettingsAction,
  uploadSiteAdImagesAction,
} from "../../app/sistema/configuracoes/patrocinadores/actions";

const MAX_PREPARED_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_SOURCE_BYTES = 40 * 1024 * 1024;

async function prepareAdvertisingImage(source: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(source.type)) {
    throw new Error("Formato não aceito: " + source.name + ". Escolha JPEG, PNG, WebP ou AVIF.");
  }
  if (source.size > MAX_UPLOAD_SOURCE_BYTES) {
    throw new Error(source.name + ": limite de 40 MB por imagem original.");
  }
  const url = URL.createObjectURL(source);
  let image: HTMLImageElement;
  try {
    image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
  } catch {
    throw new Error("Não foi possível abrir " + source.name + ". Verifique o arquivo.");
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("Imagem sem dimensões válidas: " + source.name);
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador não suporta a preparação de imagens.");

  let longestSide = Math.min(2048, Math.max(image.naturalWidth, image.naturalHeight));
  for (const quality of [0.72, 0.6, 0.48, 0.4]) {
    const scale = Math.min(1, longestSide / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.type !== "image/webp") {
      throw new Error("Este navegador não conseguiu converter " + source.name + " em WebP.");
    }
    if (blob.size <= MAX_PREPARED_BYTES) {
      const name = source.name.replace(/\.[^.]+$/, "") + ".webp";
      return new File([blob], name, { type: "image/webp" });
    }
    longestSide = Math.max(720, Math.round(longestSide * 0.75));
  }
  throw new Error(source.name + ": não foi possível reduzir para o limite seguro de upload.");
}

function slotIdentity(slotNumber: number): { position: number; side: "Esquerda" | "Direita" } {
  return {
    position: Math.ceil(slotNumber / 2),
    side: slotNumber % 2 === 1 ? "Esquerda" : "Direita",
  };
}

function SlotCard({ slot }: { slot: SiteAdSlotWithMedia }): JSX.Element {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [seconds, setSeconds] = useState(String(Math.round(slot.rotationIntervalMs / 1000)));
  const [effect, setEffect] = useState<SiteAdSlotTransitionEffect>(slot.transitionEffect);
  const [fitMode, setFitMode] = useState<SiteAdFitMode>(slot.fitMode);
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const identity = slotIdentity(slot.slotNumber);

  // Revoga as URLs somente ao retirá-las, trocar a seleção ou desmontar o
  // componente. Não revogue todas a cada mudança do estado de prévias:
  // isso faz as imagens restantes desaparecerem ao remover uma miniatura.
  useEffect(() => () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
  }, []);

  function selectFiles(files: FileList | null): void {
    setMessage(null);
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
    const selected = files ? Array.from(files).map((file) => {
      const url = URL.createObjectURL(file);
      previewUrlsRef.current.add(url);
      return { file, url };
    }) : [];
    setPreviews(selected);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removePreview(index: number): void {
    setMessage(null);
    const removed = previews[index];
    if (removed) {
      URL.revokeObjectURL(removed.url);
      previewUrlsRef.current.delete(removed.url);
    }
    setPreviews((items) => items.filter((_, itemIndex) => itemIndex !== index));
  }

  function saveSettings(): void {
    setMessage(null);
    const value = Math.max(2, Math.min(120, Number(seconds) || 10)) * 1000;
    startTransition(async () => {
      const result = await updateSiteAdSlotSettingsAction(slot.id, value, effect, fitMode);
      if (result && "error" in result) {
        setMessage(result.error);
        return;
      }
      setMessage("Configuração salva.");
      router.refresh();
    });
  }

  function toggle(): void {
    setMessage(null);
    startTransition(async () => {
      const result = await toggleSiteAdSlotActiveAction(slot.id, !slot.active);
      if (result && "error" in result) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  function upload(): void {
    if (uploading) return;
    if (!previews.length) {
      setMessage("Selecione uma ou mais imagens.");
      return;
    }
    const selected = [...previews];
    setMessage(null);
    setUploadProgress(null);
    setUploading(true);
    void (async () => {
      let sent = 0;
      const warnings: string[] = [];
      // O limite da Vercel aplica-se à requisição inteira. Nunca enviar o
      // conjunto de fotos originais numa única Server Action.
      for (let index = 0; index < selected.length; index += 1) {
        const { file } = selected[index];
        setUploadProgress("Enviando " + (index + 1) + " de " + selected.length + ": " + file.name);
        try {
          const optimized = await prepareAdvertisingImage(file);
          const formData = new FormData();
          formData.append("files", optimized);
          const result = await uploadSiteAdImagesAction(slot.id, slot.media.length + sent, formData);
          if (!result || typeof result !== "object") {
            warnings.push(file.name + ": o servidor não respondeu. Atualize a página e confira as imagens antes de tentar novamente.");
            break; // Resposta ambígua: evita reenviar uma foto que pode ter sido cadastrada.
          }
          if ("error" in result) {
            warnings.push(file.name + ": " + result.error);
            continue;
          }
          sent += result.count;
          warnings.push(...result.warnings);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido.";
          if (/413|payload too large|request entity too large/i.test(message)) {
            warnings.push(file.name + ": requisição recusada pelo tamanho. Tente uma imagem menor.");
          } else {
            warnings.push(file.name + ": " + message);
          }
        }
      }
      setUploadProgress(null);
      setMessage([
        sent ? sent + " imagem(ns) enviada(s)." : "Nenhuma imagem enviada.",
        ...warnings,
        sent > 0 && warnings.length ? "Para repetir, selecione apenas as fotos que falharam." : "",
      ].filter(Boolean).join(" "));
      // Após um envio parcial, nunca permitir reenviar por engano as fotos
      // já gravadas. Para tentar de novo, selecione somente as que falharam.
      if (sent > 0) {
        if (inputRef.current) inputRef.current.value = "";
        for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
        previewUrlsRef.current.clear();
        setPreviews([]);
      }
      router.refresh();
    })().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar as imagens.");
    }).finally(() => {
      setUploadProgress(null);
      setUploading(false);
    });
  }

  function move(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= slot.media.length) return;
    const ids = slot.media.map((item) => item.id);
    const moved = ids.splice(index, 1)[0];
    ids.splice(target, 0, moved);
    startTransition(async () => {
      const result = await reorderSiteAdMediaAction(slot.id, ids);
      if (result && "error" in result) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  function remove(id: string): void {
    if (!window.confirm("Remover esta imagem desta posição?")) return;
    startTransition(async () => {
      const result = await removeSiteAdMediaAction(id);
      if (result && "error" in result) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  const previewObjectFit = fitMode === "stretch" ? "fill" : "contain";

  return (
    <article className="site-ad-slot-card">
      <div className="site-ad-slot-head">
        <div>
          <h3>Posição {identity.position} - {identity.side}</h3>
          <span className={"status-pill " + (slot.active ? "status-pill--published" : "status-pill--archived")}>
            {slot.active ? "Ativa" : "Desativada"}
          </span>
        </div>
        <button type="button" onClick={toggle} disabled={pending}>
          {slot.active ? "Desativar" : "Ativar"}
        </button>
      </div>

      <div className="site-ad-slot-settings">
        <label className="form-field">
          <span className="field-label">Tempo por imagem</span>
          <div className="site-ad-seconds"><input type="number" min={2} max={120} value={seconds} onChange={(event) => setSeconds(event.target.value)} /><span>s</span></div>
        </label>
        <label className="form-field">
          <span className="field-label">Transição</span>
          <select value={effect} onChange={(event) => setEffect(event.target.value as SiteAdSlotTransitionEffect)}>
            {SITE_AD_SLOT_TRANSITION_EFFECTS.map((item) => <option key={item} value={item}>{SITE_AD_SLOT_TRANSITION_EFFECT_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="form-field">
          <span className="field-label">Formato da imagem</span>
          <select value={fitMode} onChange={(event) => setFitMode(event.target.value as SiteAdFitMode)}>
            {(Object.keys(SITE_AD_FIT_MODE_LABELS) as SiteAdFitMode[]).map((item) => <option key={item} value={item}>{SITE_AD_FIT_MODE_LABELS[item]}</option>)}
          </select>
        </label>
        <button type="button" className="form-action-primary" onClick={saveSettings} disabled={pending}>Salvar posição</button>
      </div>

      <div className="site-ad-upload">
        <div>
          <strong>Imagens desta posição</strong>
          <p className="helper-text">Envio múltiplo · R2 público · convertido para WebP com qualidade 70%.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={(event) => selectFiles(event.target.files)}
          disabled={pending || uploading}
        />
        {previews.length ? (
          <>
          <div className="site-ad-preview-tools">
            <strong>{previews.length} {previews.length === 1 ? "imagem selecionada" : "imagens selecionadas"} — ainda não {previews.length === 1 ? "enviada" : "enviadas"}</strong>
            <button
              type="button"
              className="site-ad-clear-pending"
              onClick={() => selectFiles(null)}
              disabled={pending || uploading}
            >
              Limpar seleção
            </button>
          </div>
          <div className="site-ad-preview-grid">
            {previews.map(({ file, url }, index) => (
              <div key={url} className="site-ad-preview-item">
                <div className="site-ad-pending-image">
                  <img src={url} alt={"Prévia " + (index + 1)} style={{ objectFit: previewObjectFit }} />
                </div>
                <span className="site-ad-preview-file-name" title={file.name}>{file.name}</span>
                <button
                  type="button"
                  className="site-ad-remove-pending"
                  aria-label={"Retirar imagem " + (index + 1) + " da seleção"}
                  onClick={() => removePreview(index)}
                  disabled={pending || uploading}
                >× Retirar</button>
              </div>
            ))}
          </div>
          </>
        ) : null}
        <button type="button" className="form-action-primary" onClick={upload} disabled={pending || uploading}>
          {uploading ? "Enviando..." : pending ? "Processando..." : "Enviar imagens"}
        </button>
      </div>

      {uploadProgress ? <p role="status" className="helper-text site-ad-message">{uploadProgress}</p> : null}
      {message ? <p role="status" className="helper-text site-ad-message">{message}</p> : null}

      {slot.media.length ? (
        <div className="site-ad-thumbnails">
          {slot.media.map((media, index) => (
            <div key={media.id} className="site-ad-thumb">
              <div className="site-ad-thumb-image">
                <img src={media.imageUrl} alt={media.altText ?? media.mediaAssetAltText ?? "Publicidade"} style={{ objectFit: previewObjectFit }} />
                <span>{index + 1}</span>
                <button type="button" className="site-ad-image-remove" aria-label={"Excluir imagem " + (index + 1) + " desta posição"} title="Excluir imagem" onClick={() => remove(media.id)} disabled={pending}>×</button>
              </div>
              <div className="site-ad-thumb-actions">
                <button type="button" onClick={() => move(index, -1)} disabled={pending || index === 0} aria-label="Mover para cima">↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={pending || index === slot.media.length - 1} aria-label="Mover para baixo">↓</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="helper-text site-ad-empty">Nenhuma imagem cadastrada nesta posição.</p>
      )}
    </article>
  );
}

export function SiteAdSlotsPanel({ slots }: { slots: SiteAdSlotWithMedia[] }): JSX.Element {
  const left = slots.filter((slot) => slot.slotNumber % 2 === 1).sort((a, b) => a.slotNumber - b.slotNumber);
  const right = slots.filter((slot) => slot.slotNumber % 2 === 0).sort((a, b) => a.slotNumber - b.slotNumber);

  return (
    <div className="site-ad-manager">
      <section>
        <div className="site-ad-side-heading">
          <div><p className="eyebrow">LADO ESQUERDO</p><h2>Posições 1, 2 e 3</h2></div>
          <span>cada posição gira apenas as próprias imagens</span>
        </div>
        <div className="site-ad-side-grid">{left.map((slot) => <SlotCard key={slot.id} slot={slot} />)}</div>
      </section>
      <section>
        <div className="site-ad-side-heading">
          <div><p className="eyebrow">LADO DIREITO</p><h2>Posições 1, 2 e 3</h2></div>
          <span>configuração independente por posição</span>
        </div>
        <div className="site-ad-side-grid">{right.map((slot) => <SlotCard key={slot.id} slot={slot} />)}</div>
      </section>
    </div>
  );
}
