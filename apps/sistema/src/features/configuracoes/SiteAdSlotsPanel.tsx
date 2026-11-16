"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SiteAdPublicationRow } from "./SiteAdPublicationRow";
import type { SiteAdPublicationInput } from "./siteAdPublicationPolicy";
import type {
  SiteAdFitMode,
  SiteAdMediaWithAsset,
  SiteAdSlotTransitionEffect,
  SiteAdSlotWithMedia,
} from "@ir/types";
import {
  SITE_AD_FIT_MODE_HINTS,
  SITE_AD_FIT_MODE_LABELS,
  SITE_AD_FIT_MODE_OBJECT_FIT,
  SITE_AD_FIT_MODES,
  SITE_AD_SLOT_TRANSITION_EFFECT_LABELS,
  SITE_AD_SLOT_TRANSITION_EFFECTS,
} from "@ir/types";
import {
  removeSiteAdMediaAction,
  updateSiteAdMediaFitModeAction,
  updateSiteAdMediaSettingsAction,
  updateSiteAdMediaPublicationAction,
  uploadSiteAdImagesAction,
} from "../../app/sistema/configuracoes/patrocinadores/actions";
import { notify } from "../../lib/feedback/notify";
import { confirmDialog } from "../../lib/feedback/confirmStore";
import { buildSiteAdLibrary } from "./siteAdLibrary";

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

/**
 * Formato individual da imagem — Esticar (padrão) / Encaixar / Preencher.
 * Sempre visível em cada imagem; salva na hora, só o formato, sem reenviar
 * a imagem. Sem formato próprio, a imagem usa o padrão do grupo.
 */
function MediaFitModePicker({
  media,
  slotFitMode,
  disabled,
  onChange,
}: {
  media: SiteAdMediaWithAsset;
  slotFitMode: SiteAdFitMode;
  disabled: boolean;
  onChange: (fitMode: SiteAdFitMode) => void;
}): JSX.Element {
  const router = useRouter();
  const effective = media.fitMode ?? slotFitMode;
  const [selected, setSelected] = useState<SiteAdFitMode>(effective);
  const [saving, setSaving] = useState<SiteAdFitMode | null>(null);
  const [saved, setSaved] = useState(false);

  // Dados novos do servidor (router.refresh) mandam no valor exibido.
  useEffect(() => { setSelected(effective); }, [effective]);

  async function choose(fitMode: SiteAdFitMode): Promise<void> {
    if (saving || disabled || (fitMode === selected && media.fitMode != null)) return;
    const previous = selected;
    setSaved(false);
    setSelected(fitMode);
    onChange(fitMode);
    setSaving(fitMode);
    try {
      const result = await updateSiteAdMediaFitModeAction(media.id, fitMode);
      if (!result || "error" in result) {
        setSelected(previous);
        onChange(previous);
        notify.error("Formato não salvo", result?.error ?? "O servidor não confirmou a alteração. O formato anterior foi mantido.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setSelected(previous);
      onChange(previous);
      notify.error("Formato não salvo", "Falha de conexão. O formato anterior foi mantido.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="site-ad-fit-picker">
      <span className="site-ad-fit-picker-label">
        Formato no site
        {saving ? <em> · salvando…</em> : saved ? <em> · salvo ✓</em> : media.fitMode == null ? <em> · formato padrão</em> : null}
      </span>
      <div className="site-ad-fit-options" role="radiogroup" aria-label="Formato desta imagem no site">
        {SITE_AD_FIT_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected === mode}
            className={"site-ad-fit-option" + (selected === mode ? " is-selected" : "")}
            title={SITE_AD_FIT_MODE_HINTS[mode]}
            onClick={() => void choose(mode)}
            disabled={disabled || saving !== null}
          >
            {SITE_AD_FIT_MODE_LABELS[mode]}
          </button>
        ))}
      </div>
      <span className="helper-text site-ad-fit-hint">{SITE_AD_FIT_MODE_HINTS[selected]}</span>
    </div>
  );
}

function MediaSettingsRow({
  media,
  pending,
  onSave,
}: {
  media: SiteAdMediaWithAsset;
  pending: boolean;
  onSave: (changes: { rotationIntervalMs: number | null; transitionEffect: SiteAdSlotTransitionEffect | null }) => Promise<boolean>;
}): JSX.Element {
  // O formato tem seletor próprio (MediaFitModePicker); aqui fica só a transição.
  const hasOverride = media.rotationIntervalMs != null || media.transitionEffect != null;
  const [custom, setCustom] = useState(hasOverride);
  const [effect, setEffect] = useState<SiteAdSlotTransitionEffect>(media.transitionEffect ?? "fade");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    if (saving || pending) return;
    setSaved(false);
    setSaving(true);
    try {
      const changes = !custom
        ? { rotationIntervalMs: null, transitionEffect: null }
        : {
            // Tempo por imagem não vale mais no site (esteira única de 10s,
            // decisão do usuário 07/11/2026) — preserva o valor gravado.
            rotationIntervalMs: media.rotationIntervalMs ?? null,
            transitionEffect: effect,
          };
      const confirmed = await onSave(changes);
      if (confirmed) setSaved(true);
      else notify.error("Não foi possível salvar a imagem", "O servidor não confirmou a alteração. Confira a mensagem do grupo e tente novamente.");
    } catch {
      notify.error("Não foi possível salvar a imagem", "Falha de conexão. As configurações anteriores foram preservadas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="site-ad-thumb-settings">
      <label className="site-ad-thumb-custom-toggle">
        <input
          type="checkbox"
          checked={custom}
          onChange={(event) => setCustom(event.target.checked)}
          disabled={pending}
        />
        Transição própria desta imagem
      </label>
      {custom ? (
        <div className="site-ad-thumb-settings-fields">
          <select value={effect} onChange={(event) => setEffect(event.target.value as SiteAdSlotTransitionEffect)} disabled={pending}>
            {SITE_AD_SLOT_TRANSITION_EFFECTS.map((item) => <option key={item} value={item}>{SITE_AD_SLOT_TRANSITION_EFFECT_LABELS[item]}</option>)}
          </select>
        </div>
      ) : (
        <span className="helper-text">Usa a transição já configurada.</span>
      )}
      <button type="button" className="cadastros-btn-secondary" onClick={() => void save()} disabled={pending || saving}>
        {saving ? "Salvando…" : saved ? "Salvo ✓" : "Salvar transição"}
      </button>
    </div>
  );
}

/** Uma imagem do grupo: prévia no quadro 7:10 do site, já no formato escolhido. */
function SponsorMediaThumb({
  media,
  index,
  slotFitMode,
  pending,
  uploading,
  onRemove,
  onSaveSettings,
  onSavePublication,
}: {
  media: SiteAdMediaWithAsset;
  index: number;
  slotFitMode: SiteAdFitMode;
  pending: boolean;
  uploading: boolean;
  onRemove: () => void;
  onSaveSettings: (changes: { rotationIntervalMs: number | null; transitionEffect: SiteAdSlotTransitionEffect | null }) => Promise<boolean>;
  onSavePublication: (changes: SiteAdPublicationInput) => Promise<{ error: string } | void>;
}): JSX.Element {
  const [shownFit, setShownFit] = useState<SiteAdFitMode>(media.fitMode ?? slotFitMode);
  useEffect(() => { setShownFit(media.fitMode ?? slotFitMode); }, [media.fitMode, slotFitMode]);

  return (
    <div className="site-ad-thumb">
      <div className="site-ad-thumb-image site-ad-thumb-image--site-frame">
        <img
          src={media.imageUrl}
          alt={media.altText ?? media.mediaAssetAltText ?? "Publicidade"}
          style={{ objectFit: SITE_AD_FIT_MODE_OBJECT_FIT[shownFit] ?? "fill" }}
        />
        <span>{index + 1}</span>
        <button type="button" className="site-ad-image-remove" aria-label={"Remover patrocinador " + (index + 1)} title="Excluir imagem" onClick={onRemove} disabled={pending}>×</button>
      </div>
      <details className="site-ad-library-advanced">
        <summary>Formato e efeito da imagem</summary>
        <MediaFitModePicker media={media} slotFitMode={slotFitMode} disabled={pending || uploading} onChange={setShownFit} />
        <MediaSettingsRow media={media} pending={pending} onSave={onSaveSettings} />
      </details>
      <SiteAdPublicationRow media={media} pending={pending || uploading} onSave={onSavePublication} />
    </div>
  );
}


/**
 * Biblioteca única: os seis slots existentes continuam no banco para preservar
 * cadastros, configuração por imagem e a esteira de 07/11. O operador não escolhe
 * slot e nunca precisa conhecer a posição física na qual a imagem aparecerá.
 */
export function SiteAdSlotsPanel({ slots }: { slots: SiteAdSlotWithMedia[] }): JSX.Element {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { entries, uploadSlot } = buildSiteAdLibrary(slots);
  const activeCount = entries.filter(({ media, slot }) => media.active && slot.active).length;

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
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePreview(index: number): void {
    const item = previews[index];
    if (item) {
      URL.revokeObjectURL(item.url);
      previewUrlsRef.current.delete(item.url);
    }
    setPreviews((current) => current.filter((_, i) => i !== index));
  }

  async function upload(): Promise<void> {
    if (!uploadSlot || uploading || pending) return;
    if (!previews.length) {
      notify.error("Selecione as imagens", "Escolha uma ou mais imagens dos patrocinadores.");
      return;
    }
    const selected = [...previews];
    const initialOrder = Math.max(-1, ...uploadSlot.media.map((item) => item.sortOrder)) + 1;
    let created = 0;
    const warnings: string[] = [];
    setUploading(true);
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index].file;
        setUploadProgress("Enviando " + (index + 1) + " de " + selected.length + ": " + file.name);
        try {
          const optimized = await prepareAdvertisingImage(file);
          const data = new FormData();
          data.append("files", optimized);
          // O primeiro slot ativo é um detalhe de armazenamento, nunca uma
          // escolha do usuário. A esteira pública lê imagens dos seis slots.
          const result = await uploadSiteAdImagesAction(uploadSlot.id, initialOrder + created, data);
          if (!result || typeof result !== "object") {
            warnings.push(file.name + ": não houve confirmação do servidor. Confira a galeria antes de reenviar.");
            break;
          }
          if ("error" in result) {
            warnings.push(file.name + ": " + result.error);
            continue;
          }
          created += result.count;
          warnings.push(...result.warnings);
        } catch (error) {
          warnings.push(file.name + ": " + (error instanceof Error ? error.message : "Falha de conexão."));
        }
      }
      if (created > 0) {
        selectFiles(null); // Não permitir reenvio involuntário após upload parcial.
        if (warnings.length === 0) notify.success("Imagens adicionadas", created + " patrocinador(es) na biblioteca.");
        else notify.warning("Envio parcial", created + " enviado(s). " + warnings.join(" ") + " Se necessário, selecione somente os arquivos que falharam.");
      } else {
        notify.error("Nenhuma imagem enviada", warnings.join(" ") || "Confira os arquivos e tente novamente.");
      }
      router.refresh();
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function remove(id: string): Promise<void> {
    if (uploading || pending) return;
    const confirmed = await confirmDialog({
      title: "Remover este patrocinador da biblioteca?",
      confirmLabel: "Remover",
    });
    if (!confirmed) return;
    startTransition(async () => {
      try {
        const result = await removeSiteAdMediaAction(id);
        if (result && "error" in result) {
          notify.error("Não foi possível remover", result.error);
          return;
        }
        notify.success("Patrocinador removido", "A imagem foi retirada da rotação.");
        router.refresh();
      } catch {
        notify.error("Não foi possível remover", "Falha de conexão. Confira a galeria antes de repetir.");
      }
    });
  }

  async function updateSettings(
    id: string,
    changes: { rotationIntervalMs: number | null; transitionEffect: SiteAdSlotTransitionEffect | null },
  ): Promise<boolean> {
    try {
      const result = await updateSiteAdMediaSettingsAction(id, changes);
      if (result && "error" in result) {
        notify.error("Configuração não salva", result.error);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      notify.error("Configuração não salva", "Falha de conexão. Os dados anteriores foram preservados.");
      return false;
    }
  }

  async function updatePublication(id: string, changes: SiteAdPublicationInput): Promise<{ error: string } | void> {
    try {
      const result = await updateSiteAdMediaPublicationAction(id, changes);
      if (result && "error" in result) return result;
      router.refresh();
    } catch {
      return { error: "Falha de conexão. Confira a galeria antes de repetir." };
    }
  }

  return (
    <div className="site-ad-manager site-ad-library">
      <section>
        <div className="site-ad-library-heading">
          <div>
            <p className="eyebrow">PATROCINADORES</p>
            <h2>Biblioteca de imagens</h2>
            <p className="helper-text">Adicione ou retire as imagens dos clientes aqui. Todas entram no mesmo rodízio e circulam automaticamente pelas seis posições do portal, sem escolher grupos ou locais.</p>
          </div>
          <span className="site-ad-library-count">{entries.length} cadastrada(s) · {activeCount} exibindo</span>
        </div>

        <div className="site-ad-slot-card site-ad-library-upload-card">
          <div className="site-ad-upload">
            <label className="field-label" htmlFor="site-ad-library-files">Adicionar imagens dos patrocinadores</label>
            <p className="helper-text">JPEG, PNG, WebP ou AVIF. As imagens são otimizadas automaticamente antes do envio.</p>
            <input id="site-ad-library-files" ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(event) => selectFiles(event.target.files)} disabled={uploading || pending || !uploadSlot} />
            {previews.length > 0 ? (
              <>
                <div className="site-ad-preview-tools">
                  <strong>{previews.length} imagem(ns) selecionada(s) — ainda não enviadas</strong>
                  <button type="button" className="site-ad-clear-pending" onClick={() => selectFiles(null)} disabled={uploading || pending}>Limpar seleção</button>
                </div>
                <div className="site-ad-preview-grid">
                  {previews.map(({ file, url }, index) => (
                    <div className="site-ad-preview-item" key={url}>
                      <img src={url} alt={"Prévia: " + file.name} />
                      <span className="site-ad-preview-file-name" title={file.name}>{file.name}</span>
                      <button type="button" className="site-ad-remove-pending" onClick={() => removePreview(index)} disabled={uploading || pending}>× Retirar</button>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            {!uploadSlot ? <p role="alert" className="helper-text">Nenhuma posição interna está ativa. Peça à administração para verificar a configuração antes de enviar imagens.</p> : null}
            <button type="button" className="form-action-primary" onClick={() => void upload()}
              disabled={uploading || pending || !uploadSlot || previews.length === 0}>
              {uploading ? "Enviando..." : "Adicionar à biblioteca"}
            </button>
            {uploadProgress ? <p role="status" className="helper-text site-ad-message">{uploadProgress}</p> : null}
          </div>
        </div>

        <div className="site-ad-library-heading">
          <div>
            <h3>Imagens cadastradas</h3>
            <p className="helper-text">Para atualizar a arte de um cliente, envie a nova imagem e depois pause ou remova a anterior. O rodízio é automático.</p>
          </div>
        </div>
        {entries.length > 0 ? (
          <div className="site-ad-library-gallery">
            {entries.map(({ slot, media }, index) => (
              <article className="site-ad-library-item" key={media.id}>
                {!slot.active ? <p className="site-ad-library-warning">Imagem vinculada a uma posição interna desativada. Não aparece no portal.</p> : null}
                <SponsorMediaThumb media={media} index={index} slotFitMode={slot.fitMode}
                  pending={pending} uploading={uploading}
                  onRemove={() => void remove(media.id)}
                  onSaveSettings={(changes) => updateSettings(media.id, changes)}
                  onSavePublication={(changes) => updatePublication(media.id, changes)} />
              </article>
            ))}
          </div>
        ) : <p className="helper-text site-ad-empty">Ainda não há imagens cadastradas. Use o campo acima para adicionar a primeira.</p>}
      </section>
    </div>
  );
}
