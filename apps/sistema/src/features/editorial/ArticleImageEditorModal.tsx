"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import type { MediaAsset } from "@ir/types";
import { uploadMediaAssets } from "../../app/sistema/editorial/midias/actions";
import styles from "./ArticleImageEditorModal.module.css";

type CropAspect = "free" | "1:1" | "4:3" | "16:9" | "3:4";

const CROP_ASPECT_RATIOS: { value: CropAspect; label: string; ratio: number | null }[] = [
  { value: "free", label: "Livre", ratio: null },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "3:4", label: "Vertical 3:4", ratio: 3 / 4 },
];

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.2;

/**
 * Objetos do R2 não respondem CORS — um `<img>` carregado direto da URL
 * pública "mancha" o canvas (erro de segurança ao tentar gerar o blob do
 * recorte). O proxy same-origin (`/api/media-proxy`) resolve isso sem
 * precisar mudar a configuração do bucket nem criar um storage paralelo.
 */
function proxiedImageUrl(url: string): string {
  return `/api/media-proxy?url=${encodeURIComponent(url)}`;
}

interface ArticleImageEditorModalProps {
  asset: MediaAsset;
  onClose: () => void;
  /** Chamado só depois que a derivada já está 100% registrada (upload + media_asset) — nunca antes. */
  onSaved: (newAsset: MediaAsset) => void;
}

/**
 * Visualizador + editor básico (zoom, rotação, recorte) de uma imagem já
 * vinculada à matéria. Nunca sobrescreve a mídia original: "Salvar" sempe
 * gera uma derivada nova (mesmo pipeline de upload/otimização do R2 já
 * usado em `uploadMediaAssets`) e só então substitui o vínculo — se algo
 * falhar no meio do caminho, a matéria continua apontando pra imagem
 * anterior. O modal nunca fecha sozinho depois de salvar (regra expressa).
 */
export function ArticleImageEditorModal({ asset, onClose, onSaved }: ArticleImageEditorModalProps): JSX.Element {
  const [currentAsset, setCurrentAsset] = useState(asset);
  const [mode, setMode] = useState<"view" | "crop">("view");
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0); // graus: 0/90/180/270
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cropAspect, setCropAspect] = useState<CropAspect>("free");
  const [cropSize, setCropSize] = useState({ w: 1, h: 1 }); // fração do viewport (0-1)
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragState = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; startSize: { w: number; h: number } } | null>(null);

  // Trava o scroll da página por trás enquanto o modal está aberto.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // ESC fecha — exceto durante o salvamento, pra não abandonar um upload em andamento.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  function resetView(): void {
    setScale(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }

  function enterCropMode(): void {
    setCropSize({ w: 0.9, h: 0.9 });
    setMode("crop");
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (mode !== "view" && mode !== "crop") return;
    dragState.current = { startX: event.clientX, startY: event.clientY, startPan: pan };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragState.current) return;
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;
    setPan({ x: dragState.current.startPan.x + dx, y: dragState.current.startPan.y + dy });
  }

  function handleViewportPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    dragState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleResizeHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    resizeState.current = { startX: event.clientX, startY: event.clientY, startSize: cropSize };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizeHandlePointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!resizeState.current || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const dx = (event.clientX - resizeState.current.startX) / rect.width;
    const dy = (event.clientY - resizeState.current.startY) / rect.height;
    const aspect = CROP_ASPECT_RATIOS.find((item) => item.value === cropAspect)?.ratio ?? null;
    let nextW = Math.min(1, Math.max(0.15, resizeState.current.startSize.w + dx));
    let nextH = Math.min(1, Math.max(0.15, resizeState.current.startSize.h + dy));
    if (aspect) {
      // Mantém a proporção pedida — altura segue a largura, limitada ao viewport.
      nextH = Math.min(1, nextW * (rect.width / rect.height) / aspect);
      nextW = Math.min(1, nextH * aspect * (rect.height / rect.width));
    }
    setCropSize({ w: nextW, h: nextH });
  }

  function handleResizeHandlePointerUp(event: ReactPointerEvent<HTMLButtonElement>): void {
    resizeState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleCropAspectChange(nextAspect: CropAspect): void {
    setCropAspect(nextAspect);
    const ratio = CROP_ASPECT_RATIOS.find((item) => item.value === nextAspect)?.ratio ?? null;
    if (!ratio || !viewportRef.current) {
      setCropSize({ w: 0.9, h: 0.9 });
      return;
    }
    const rect = viewportRef.current.getBoundingClientRect();
    const viewportRatio = rect.width / rect.height;
    if (ratio > viewportRatio) {
      setCropSize({ w: 0.9, h: 0.9 * (viewportRatio / ratio) });
    } else {
      setCropSize({ w: 0.9 * (ratio / viewportRatio), h: 0.9 });
    }
  }

  /**
   * Rasteriza exatamente o que está dentro da moldura de recorte, na
   * resolução nativa da imagem original (nunca upscaled, nunca perde
   * qualidade por redimensionar a prévia da tela) — leva em conta
   * zoom/pan/rotação atuais.
   */
  async function rasterizeCrop(): Promise<Blob> {
    const img = imgRef.current;
    const viewport = viewportRef.current;
    if (!img || !viewport) throw new Error("Visualização não está pronta.");

    const viewportRect = viewport.getBoundingClientRect();
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;

    // Tamanho de exibição da imagem "ajustada" ao viewport (contain), antes do zoom.
    const fitScale = Math.min(viewportRect.width / naturalW, viewportRect.height / naturalH);
    const displayScale = fitScale * scale;

    // Centro da imagem exibida, já com o pan aplicado.
    const centerX = viewportRect.width / 2 + pan.x;
    const centerY = viewportRect.height / 2 + pan.y;

    const cropRect = {
      x: (viewportRect.width - cropSize.w * viewportRect.width) / 2,
      y: (viewportRect.height - cropSize.h * viewportRect.height) / 2,
      w: cropSize.w * viewportRect.width,
      h: cropSize.h * viewportRect.height,
    };

    const outW = Math.max(1, Math.round(cropRect.w / displayScale));
    const outH = Math.max(1, Math.round(cropRect.h / displayScale));

    const canvas = document.createElement("canvas");
    const rotated90 = rotation === 90 || rotation === 270;
    canvas.width = rotated90 ? outH : outW;
    canvas.height = rotated90 ? outW : outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas não suportado.");

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    // Posição, em pixels nativos da imagem, do canto superior-esquerdo do
    // recorte relativo ao centro da imagem exibida.
    const offsetX = (cropRect.x + cropRect.w / 2 - centerX) / displayScale;
    const offsetY = (cropRect.y + cropRect.h / 2 - centerY) / displayScale;
    ctx.drawImage(img, -naturalW / 2 - offsetX, -naturalH / 2 - offsetY, naturalW, naturalH);
    ctx.restore();

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem recortada."))), "image/png");
    });
  }

  function handleSave(): void {
    setError(null);
    setSavedNotice(false);
    startSaving(async () => {
      try {
        const blob = mode === "crop" ? await rasterizeCrop() : await rasterizeRotationOnly();
        const baseName = currentAsset.name.replace(/\.[^.]+$/, "") || "foto";
        const file = new File([blob], `${baseName}-editado-${Date.now()}.png`, { type: "image/png" });
        const formData = new FormData();
        formData.append("files", file);
        const result = await uploadMediaAssets(formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        const [newAsset] = result.assets;
        if (!newAsset) {
          setError("Não foi possível gerar a imagem editada.");
          return;
        }
        setCurrentAsset(newAsset);
        setMode("view");
        resetView();
        setSavedNotice(true);
        onSaved(newAsset);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível salvar a edição.");
      }
    });
  }

  /** Salvar fora do modo de recorte (só rotação/zoom) ainda gera uma derivada — nunca sobrescreve a original. */
  async function rasterizeRotationOnly(): Promise<Blob> {
    const img = imgRef.current;
    if (!img) throw new Error("Visualização não está pronta.");
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const rotated90 = rotation === 90 || rotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = rotated90 ? naturalH : naturalW;
    canvas.height = rotated90 ? naturalW : naturalH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas não suportado.");
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -naturalW / 2, -naturalH / 2, naturalW, naturalH);
    ctx.restore();
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem."))), "image/png");
    });
  }

  const hasEdits = rotation !== 0 || scale !== 1 || mode === "crop";

  return (
    <div className={styles.backdrop} role="presentation">
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="image-editor-title">
        <header className={styles.header}>
          <h3 id="image-editor-title">{currentAsset.name}</h3>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar" disabled={saving}>
            ✕
          </button>
        </header>

        <div
          ref={viewportRef}
          className={styles.viewport}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
        >
          <img
            ref={imgRef}
            src={proxiedImageUrl(currentAsset.url)}
            crossOrigin="anonymous"
            alt={currentAsset.altText ?? currentAsset.name}
            className={styles.image}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotation}deg)`,
            }}
            draggable={false}
          />
          {mode === "crop" ? (
            <div
              className={styles.cropFrame}
              style={{ width: `${cropSize.w * 100}%`, height: `${cropSize.h * 100}%` }}
            >
              <button
                type="button"
                className={styles.cropResizeHandle}
                aria-label="Redimensionar recorte"
                onPointerDown={handleResizeHandlePointerDown}
                onPointerMove={handleResizeHandlePointerMove}
                onPointerUp={handleResizeHandlePointerUp}
              />
            </div>
          ) : null}
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolGroup}>
            <button type="button" onClick={() => setScale((value) => Math.min(MAX_SCALE, value + SCALE_STEP))} aria-label="Aumentar zoom" title="Zoom +">
              +
            </button>
            <button type="button" onClick={() => setScale((value) => Math.max(MIN_SCALE, value - SCALE_STEP))} aria-label="Diminuir zoom" title="Zoom -">
              −
            </button>
            <button type="button" onClick={resetView} title="Ajustar à tela / reset">
              Reset
            </button>
            <button type="button" onClick={() => setRotation((value) => (value + 270) % 360)} aria-label="Girar 90° à esquerda" title="Girar à esquerda">
              ↺
            </button>
            <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Girar 90° à direita" title="Girar à direita">
              ↻
            </button>
          </div>

          <div className={styles.toolGroup}>
            {mode === "crop" ? (
              <>
                {CROP_ASPECT_RATIOS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={cropAspect === item.value ? styles.activeToolButton : undefined}
                    onClick={() => handleCropAspectChange(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
                <button type="button" onClick={() => setMode("view")}>
                  Cancelar recorte
                </button>
              </>
            ) : (
              <button type="button" onClick={enterCropMode}>
                Recortar
              </button>
            )}
          </div>
        </div>

        {error ? <p className={styles.errorNotice} role="alert">{error}</p> : null}
        {savedNotice && !error ? <p className={styles.savedNotice}>Alterações salvas</p> : null}

        <footer className={styles.footer}>
          <button type="button" className={styles.secondaryAction} onClick={onClose} disabled={saving}>
            Fechar
          </button>
          <button
            type="button"
            className={styles.primaryAction}
            onClick={handleSave}
            disabled={saving || !hasEdits}
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      </section>
    </div>
  );
}
