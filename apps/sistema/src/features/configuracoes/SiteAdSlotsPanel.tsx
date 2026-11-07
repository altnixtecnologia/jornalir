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
  reorderSiteAdMediaAction,
  toggleSiteAdSlotActiveAction,
  updateSiteAdMediaFitModeAction,
  updateSiteAdMediaSettingsAction,
  updateSiteAdMediaPublicationAction,
  updateSiteAdSlotSettingsAction,
  uploadSiteAdImagesAction,
} from "../../app/sistema/configuracoes/patrocinadores/actions";
import { notify } from "../../lib/feedback/notify";
import { confirmDialog } from "../../lib/feedback/confirmStore";

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
        {saving ? <em> · salvando…</em> : saved ? <em> · salvo ✓</em> : media.fitMode == null ? <em> · padrão do grupo</em> : null}
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
        <span className="helper-text">Usa a transição do grupo.</span>
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
  total,
  slotFitMode,
  pending,
  uploading,
  onRemove,
  onMove,
  onSaveSettings,
  onSavePublication,
}: {
  media: SiteAdMediaWithAsset;
  index: number;
  total: number;
  slotFitMode: SiteAdFitMode;
  pending: boolean;
  uploading: boolean;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
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
        <button type="button" className="site-ad-image-remove" aria-label={"Excluir imagem " + (index + 1) + " deste grupo"} title="Excluir imagem" onClick={onRemove} disabled={pending}>×</button>
      </div>
      <div className="site-ad-thumb-actions">
        <button type="button" onClick={() => onMove(-1)} disabled={pending || index === 0} aria-label="Mover para cima">↑</button>
        <button type="button" onClick={() => onMove(1)} disabled={pending || index === total - 1} aria-label="Mover para baixo">↓</button>
      </div>
      <MediaFitModePicker media={media} slotFitMode={slotFitMode} disabled={pending || uploading} onChange={setShownFit} />
      <MediaSettingsRow media={media} pending={pending} onSave={onSaveSettings} />
      <SiteAdPublicationRow media={media} pending={pending || uploading} onSave={onSavePublication} />
    </div>
  );
}

function SlotCard({ slot }: { slot: SiteAdSlotWithMedia }): JSX.Element {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [effect, setEffect] = useState<SiteAdSlotTransitionEffect>(slot.transitionEffect);
  const [fitMode, setFitMode] = useState<SiteAdFitMode>(slot.fitMode);
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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
    startTransition(async () => {
      // Tempo do grupo não é mais editável (esteira única de 10s) — reenvia o valor atual.
      const result = await updateSiteAdSlotSettingsAction(slot.id, slot.rotationIntervalMs, effect, fitMode);
      if (result && "error" in result) {
        notify.error("Não foi possível salvar a configuração", result.error);
        return;
      }
      notify.success("Configuração salva", "As configurações do grupo foram salvas.");
      router.refresh();
    });
  }

  function toggle(): void {
    startTransition(async () => {
      const result = await toggleSiteAdSlotActiveAction(slot.id, !slot.active);
      if (result && "error" in result) {
        notify.error("Não foi possível alterar o grupo", result.error);
        return;
      }
      router.refresh();
    });
  }

  function upload(): void {
    if (uploading) return;
    if (!previews.length) {
      notify.error("Nenhuma imagem selecionada", "Selecione uma ou mais imagens antes de enviar.");
      return;
    }
    const selected = [...previews];
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
      if (sent > 0 && warnings.length === 0) {
        notify.success(sent + " imagem(ns) enviada(s)", "As imagens foram adicionadas ao grupo.");
      } else if (sent > 0 && warnings.length > 0) {
        notify.warning(sent + " imagem(ns) enviada(s), outras falharam",
          [...warnings, "Para repetir, selecione apenas as fotos que falharam."].join(" "));
      } else {
        notify.error("Nenhuma imagem enviada", warnings.join(" ") || "Não foi possível enviar as imagens.");
      }
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
      notify.error("Nenhuma imagem enviada", error instanceof Error ? error.message : "Não foi possível enviar as imagens.");
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
        notify.error("Não foi possível reordenar", result.error);
        return;
      }
      router.refresh();
    });
  }

  async function remove(id: string): Promise<void> {
    const confirmed = await confirmDialog({ title: "Remover esta imagem deste grupo?", confirmLabel: "Remover" });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await removeSiteAdMediaAction(id);
      if (result && "error" in result) {
        notify.error("Não foi possível remover a imagem", result.error);
        return;
      }
      notify.success("Imagem removida", "A imagem foi removida deste grupo.");
      router.refresh();
    });
  }

  async function updateMediaSettings(
    id: string,
    changes: { rotationIntervalMs: number | null; transitionEffect: SiteAdSlotTransitionEffect | null },
  ): Promise<boolean> {
    // Erro é mostrado pelo próprio `SlotSettings` (chamador); evitar
    // duplicar o mesmo aviso aqui.
    try {
      const result = await updateSiteAdMediaSettingsAction(id, changes);
      // Server Action histórica devolve void no sucesso; apenas
      // {error} identifica falha (não inverter este protocolo).
      if (result && "error" in result) {
        return false;
      }
      router.refresh();
      return true;
    } catch {
      return false;
    }
  }

  async function updatePublication(id:string,changes:SiteAdPublicationInput):Promise<{error:string}|void>{
    // Erro é mostrado pelo próprio `SiteAdPublicationRow` (chamador); evitar
    // duplicar o mesmo aviso aqui.
    try{
      const response=await updateSiteAdMediaPublicationAction(id,changes);
      if(response && "error" in response){
        return response;
      }
      router.refresh();
    }catch{
      const error="Falha ao salvar período de veiculação. Verifique antes de repetir.";
      return {error};
    }
  }

  // Prévia das imagens ainda não enviadas: entram com o padrão do grupo.
  const previewObjectFit = SITE_AD_FIT_MODE_OBJECT_FIT[fitMode] ?? "fill";

  return (
    <article className="site-ad-slot-card">
      <div className="site-ad-slot-head">
        <div>
          <h3>Grupo {slot.slotNumber}</h3>
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
          <span className="field-label">Transição</span>
          <select value={effect} onChange={(event) => setEffect(event.target.value as SiteAdSlotTransitionEffect)}>
            {SITE_AD_SLOT_TRANSITION_EFFECTS.map((item) => <option key={item} value={item}>{SITE_AD_SLOT_TRANSITION_EFFECT_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="form-field">
          <span className="field-label">Formato padrão do grupo</span>
          <select
            value={fitMode}
            onChange={(event) => setFitMode(event.target.value as SiteAdFitMode)}
            title="Vale para as imagens deste grupo que ainda não têm formato próprio."
          >
            {SITE_AD_FIT_MODES.map((item) => <option key={item} value={item}>{SITE_AD_FIT_MODE_LABELS[item]}</option>)}
          </select>
        </label>
        <button type="button" className="form-action-primary" onClick={saveSettings} disabled={pending}>Salvar grupo</button>
      </div>

      <div className="site-ad-upload">
        <div>
          <strong>Imagens deste grupo</strong>
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

      {slot.media.length ? (
        <div className="site-ad-thumbnails">
          {slot.media.map((media, index) => (
            <SponsorMediaThumb
              key={media.id}
              media={media}
              index={index}
              total={slot.media.length}
              slotFitMode={slot.fitMode}
              pending={pending}
              uploading={uploading}
              onRemove={() => remove(media.id)}
              onMove={(direction) => move(index, direction)}
              onSaveSettings={(changes) => updateMediaSettings(media.id, changes)}
              onSavePublication={(changes) => updatePublication(media.id, changes)}
            />
          ))}
        </div>
      ) : (
        <p className="helper-text site-ad-empty">Nenhuma imagem cadastrada nesta posição.</p>
      )}
    </article>
  );
}

export function SiteAdSlotsPanel({ slots }: { slots: SiteAdSlotWithMedia[] }): JSX.Element {
  const groups = [...slots].sort((a, b) => a.slotNumber - b.slotNumber);

  return (
    <div className="site-ad-manager">
      <section>
        <div className="site-ad-side-heading">
          <div><p className="eyebrow">PATROCINADORES</p><h2>Grupos de anúncios</h2></div>
          <span>
            Todas as imagens ativas de todos os grupos formam uma fila única de patrocinadores. A cada 10 segundos
            cada imagem anda uma posição: todas passam pelas seis posições do site, ficam o mesmo tempo na tela e
            nunca aparecem duas vezes ao mesmo tempo. Os grupos servem só para organizar a ordem da fila. Cada
            imagem tem o próprio formato no site — Esticar (padrão), Encaixar ou Preencher — e o mantém em
            qualquer posição.
          </span>
        </div>
        <div className="site-ad-side-grid">{groups.map((slot) => <SlotCard key={slot.id} slot={slot} />)}</div>
      </section>
    </div>
  );
}
