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
  const identity = slotIdentity(slot.slotNumber);

  // Revoga as URLs somente ao retirá-las, trocar a seleção ou desmontar o
  // componente. Não revogue todas a cada mudança do estado de prévias:
  // isso faz as imagens restantes desaparecerem ao remover uma miniatura.
  useEffect(() => () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
  }, []);

  function selectFiles(files: FileList | null): void {
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
    if (!previews.length) {
      setMessage("Selecione uma ou mais imagens.");
      return;
    }
    const formData = new FormData();
    previews.forEach(({ file }) => formData.append("files", file));
    setMessage(null);
    startTransition(async () => {
      const result = await uploadSiteAdImagesAction(slot.id, slot.media.length, formData);
      if ("error" in result) {
        setMessage(result.error);
        return;
      }
      setMessage(
        result.warnings.length
          ? result.count + " imagem(ns) enviada(s). " + result.warnings.join(" ")
          : result.count + " imagem(ns) enviada(s).",
      );
      if (inputRef.current) inputRef.current.value = "";
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
      previewUrlsRef.current.clear();
      setPreviews([]);
      router.refresh();
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
          disabled={pending}
        />
        {previews.length ? (
          <div className="site-ad-preview-grid">
            {previews.map(({ url }, index) => (
              <div key={url} className="site-ad-preview-item">
                <img src={url} alt={"Prévia " + (index + 1)} style={{ objectFit: previewObjectFit }} />
                <button type="button" className="site-ad-image-remove" aria-label={"Retirar imagem " + (index + 1) + " do envio"} title="Retirar do envio" onClick={() => removePreview(index)} disabled={pending}>×</button>
              </div>
            ))}
          </div>
        ) : null}
        <button type="button" className="form-action-primary" onClick={upload} disabled={pending}>
          {pending ? "Processando..." : "Enviar imagens"}
        </button>
      </div>

      {message ? <p className="helper-text site-ad-message">{message}</p> : null}

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
