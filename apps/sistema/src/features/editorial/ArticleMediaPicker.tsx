import { useEffect, useRef, useState, useTransition } from "react";
import type { ArticleMedia, ArticleMediaRole, MediaAsset } from "@ir/types";
import { searchMediaLibrary, uploadMediaAssets } from "../../app/sistema/editorial/midias/actions";
import { ArticleImageEditorModal } from "./ArticleImageEditorModal";
import { PreUploadImageCrop } from "./PreUploadImageCrop";
import { DesktopArticleImageCrop } from "./DesktopArticleImageCrop";
import styles from "./ArticleMediaPicker.module.css";

type MediaIcon = "view" | "edit" | "replace" | "remove" | "help" | "cover";
function MediaActionIcon({ kind }: { kind: MediaIcon }): JSX.Element {
  const shapes: Record<MediaIcon, JSX.Element> = {
    view: <><path d="M2 12s3.7-6 10-6 10 6 10 6-3.7 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" /></>,
    edit: <><path d="M6 2v5H2M18 22v-5h4M8 5h9a2 2 0 0 1 2 2v9M16 19H7a2 2 0 0 1-2-2V8" /><path d="M8 13h7v6H8z" /></>,
    replace: <><path d="M20 7H8l3-3M8 7l3 3M4 17h12l-3-3M16 17l-3 3" /><path d="M17 4h3v6M7 20H4v-6" /></>,
    remove: <><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7" /></>,
    help: <><circle cx="12" cy="12" r="10" /><path d="M12 11v6M12 7h.01" /></>,
    cover: <path d="m12 2 3.1 6.3 7 1-5.05 4.92 1.2 6.96L12 17.9l-6.25 3.28 1.2-6.96L1.9 9.3l7-1L12 2Z" />,
  };
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {shapes[kind]}
  </svg>;
}

interface ArticleMediaPickerProps {
  mediaAssets: MediaAsset[];
  media: ArticleMedia[];
  onSetCover: (mediaAssetId: string) => void;
  onRemoveCover: () => void;
  onAddToGallery: (mediaAssetId: string) => void;
  onRemoveFromGallery: (mediaAssetId: string) => void;
  onReorderMedia: (draggedMediaAssetId: string, targetMediaAssetId: string, placement: "before" | "after") => void;
  onSetCaption: (mediaAssetId: string, caption: string) => void;
  onSetCredit: (mediaAssetId: string, credit: string) => void;
  /** Chamado com as mídias recém-cadastradas — quem usa decide se some com a capa/galeria automaticamente. */
  onFilesUploaded: (assets: MediaAsset[]) => void;
  /** Substitui o vínculo de UM slot (capa, ou uma posição exata da galeria) por uma mídia derivada — nunca a mídia original em si. */
  onReplaceMediaAsset: (target: { role: ArticleMediaRole; order: number }, newAsset: MediaAsset) => void;
}

export function ArticleMediaPicker({
  mediaAssets,
  media,
  onSetCover,
  onRemoveCover,
  onAddToGallery,
  onRemoveFromGallery,
  onReorderMedia,
  onSetCaption,
  onSetCredit,
  onFilesUploaded,
  onReplaceMediaAsset,
}: ArticleMediaPickerProps): JSX.Element {
  const [viewerTarget, setViewerTarget] = useState<{ role: ArticleMediaRole; order: number; mediaAssetId: string } | null>(null);
  const [remoteMediaAssets, setRemoteMediaAssets] = useState<MediaAsset[]>([]);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const allMediaAssets = [
    ...new Map([...mediaAssets, ...remoteMediaAssets].map((asset) => [asset.id, asset])).values(),
  ];
  const assetById = new Map(allMediaAssets.map((asset) => [asset.id, asset]));
  const cover = media.find((item) => item.role === "cover");
  const coverAsset = cover ? assetById.get(cover.mediaAssetId) : undefined;
  const gallery = media
    .filter((item) => item.role === "gallery")
    .sort((a, b) => a.order - b.order);
  const totalPhotos = media.length;
  const orderedMedia = [
    ...(cover ? [cover] : []),
    ...gallery,
  ];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [dragActive, setDragActive] = useState(false);
  const [editingTarget, setEditingTarget] = useState<{
    target: { role: ArticleMediaRole; order: number };
    file: File;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [useDesktopCrop,setUseDesktopCrop]=useState(false);
  // Apenas mouse/trackpad em PC. O crop e os gestos mobile permanecem
  // inteiramente no componente original PreUploadImageCrop.
  useEffect(()=>{
    const query=window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const check=()=>setUseDesktopCrop(query.matches);
    check();query.addEventListener("change",check);
    return ()=>query.removeEventListener("change",check);
  },[]);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [showActionHelp, setShowActionHelp] = useState(false);
  const helpAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showActionHelp) return;
    function closeOutside(event: PointerEvent): void {
      if (event.target instanceof Node && !helpAnchorRef.current?.contains(event.target)) {
        setShowActionHelp(false);
      }
    }
    function closeEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") setShowActionHelp(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [showActionHelp]);
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null);
  const [lastUploadNotice, setLastUploadNotice] = useState<string | null>(null);
  const [uploadDialog, setUploadDialog] = useState<{
    total: number;
    completed: number;
    successes: number;
    currentName: string;
    errors: string[];
    phase: "uploading" | "done";
  } | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const filteredMediaAssets = librarySearch.trim()
    ? allMediaAssets.filter((asset) => {
        const term = librarySearch.trim().toLowerCase();
        return `${asset.name} ${asset.reference} ${asset.caption ?? ""} ${asset.credit ?? ""}`.toLowerCase().includes(term);
      })
    : allMediaAssets;

  function handleRemoteSearch(): void {
    setSearchNotice(null);
    startSearch(async () => {
      const result = await searchMediaLibrary(librarySearch);
      if ("error" in result) {
        setSearchNotice(result.error);
        return;
      }
      setRemoteMediaAssets(result.assets);
      setSearchNotice(
        result.assets.length > 0
          ? `${result.assets.length} resultado(s) carregado(s) do acervo.`
          : "Nenhuma mídia encontrada no acervo.",
      );
    });
  }

  function uploadFiles(selectedFiles: File[]): void {
    if (selectedFiles.length === 0 || uploading) return;

    setLastUploadNotice(null);
    setUploadDialog({
      total: selectedFiles.length,
      completed: 0,
      successes: 0,
      currentName: selectedFiles[0]?.name ?? "",
      errors: [],
      phase: "uploading",
    });

    startUpload(async () => {
      const uploadedAssets: MediaAsset[] = [];
      const errors: string[] = [];

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        setUploadDialog((current) =>
          current
            ? { ...current, currentName: file.name, completed: index, successes: uploadedAssets.length, errors: [...errors] }
            : current,
        );

        const formData = new FormData();
        formData.append("files", file);
        const result = await uploadMediaAssets(formData);

        if ("error" in result) {
          errors.push(`${file.name}: ${result.error}`);
        } else {
          uploadedAssets.push(...result.assets);
          for (const warning of result.warnings) errors.push(warning);
        }

        const completed = index + 1;
        setUploadDialog({
          total: selectedFiles.length,
          completed,
          successes: uploadedAssets.length,
          currentName: completed < selectedFiles.length ? selectedFiles[completed].name : file.name,
          errors: [...errors],
          phase: completed === selectedFiles.length ? "done" : "uploading",
        });
      }

      if (uploadedAssets.length > 0) onFilesUploaded(uploadedAssets);
      setLastUploadNotice(
        errors.length === 0
          ? `${uploadedAssets.length} foto(s) enviada(s) com sucesso.`
          : `${uploadedAssets.length} enviada(s); ${errors.length} com aviso ou falha.`,
      );
    });
  }

  async function startEdit(
    item: ArticleMedia,
    asset: MediaAsset,
  ): Promise<void> {
    if (editLoading || uploading) return;
    setEditError(null);
    setEditLoading(true);
    try {
      // A mídia já foi convertida e armazenada no R2. Reaproveitamos
      // o proxy autorizado existente para poder recortar em canvas.
      const response = await fetch("/api/media-proxy?url=" + encodeURIComponent(asset.url), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Não foi possível abrir a foto para ajuste.");
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("Este arquivo não é uma imagem editável.");
      const file = new File([blob], asset.name || "imagem-enviada.jpg", { type: blob.type });
      setEditingTarget({ target: { role: item.role, order: item.order }, file });
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Não foi possível carregar a imagem.");
    } finally {
      setEditLoading(false);
    }
  }

  async function replaceImage(
    item: ArticleMedia,
    selected: File | undefined,
  ): Promise<void> {
    if (!selected || uploading || replacing) return;
    setEditError(null);
    setReplacing(item.mediaAssetId);
    try {
      const data = new FormData();
      data.append("files", selected);
      const result = await uploadMediaAssets(data);
      if ("error" in result) throw new Error(result.error);
      const asset = result.assets[0];
      if (!asset) throw new Error("A imagem substituta não foi confirmada pelo servidor.");
      onReplaceMediaAsset({ role: item.role, order: item.order }, asset);
      setLastUploadNotice("Imagem substituída na matéria. Salve para confirmar a alteração.");
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Falha ao substituir a imagem.");
    } finally {
      setReplacing(null);
    }
  }

  async function saveEditedImage(file: File): Promise<void> {
    if (!editingTarget) return;
    const formData = new FormData();
    formData.append("files", file);
    const result = await uploadMediaAssets(formData);
    if ("error" in result) throw new Error(result.error);
    const asset = result.assets[0];
    if (!asset) throw new Error("O servidor não confirmou o salvamento do recorte.");
    // Não sobrescreve o original; substitui apenas o vínculo na matéria.
    onReplaceMediaAsset(editingTarget.target, asset);
    setEditingTarget(null);
    setLastUploadNotice("Imagem ajustada. Salve a matéria para confirmar a alteração.");
  }

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    uploadFiles(files);
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setDragActive(false);
    if (uploading) return;
    uploadFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="media-picker">
      {editingTarget ? (
        useDesktopCrop ? (
          <DesktopArticleImageCrop
            file={editingTarget.file}
            onCrop={saveEditedImage}
            onOriginal={() => setEditingTarget(null)}
            onCancel={() => setEditingTarget(null)}
          />
        ) : (
          <PreUploadImageCrop
            mode="after-upload"
            file={editingTarget.file}
            index={0}
            total={1}
            onCrop={saveEditedImage}
            onOriginal={() => setEditingTarget(null)}
            onCancel={() => setEditingTarget(null)}
          />
        )
      ) : null}
      <div className="media-picker-section">
        <p className="field-label">Adicionar fotos</p>
        <label
          className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ""} ${uploading ? styles.dropZoneBusy : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!uploading) setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,.avif"
            multiple
            className="visually-hidden"
            onChange={handleFilesSelected}
            disabled={uploading}
          />
          <span className={styles.dropIcon} aria-hidden="true">↑</span>
          <span className={styles.dropTitle}>{uploading ? "Processando fotos…" : "Arraste as fotos aqui"}</span>
          <span className={styles.dropSubtitle}>ou toque para selecionar · envio em lote, sem edição obrigatória</span>
          <span className={styles.selectButton}>{uploading ? "Aguarde…" : "Selecionar fotos"}</span>
          <span className={styles.formatHint}>JPEG, PNG, WebP, AVIF ou GIF · até 8 MB por arquivo · ajuste opcional depois do envio</span>
        </label>
        {lastUploadNotice ? <p className={styles.lastUploadNotice}>{lastUploadNotice}</p> : null}
      </div>

      {uploadDialog ? (
        <div className={styles.modalBackdrop}>
          <section
            className={styles.uploadModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-progress-title"
          >
            <div className={styles.modalTop}>
              <div>
                <p className={styles.modalEyebrow}>UPLOAD DE MÍDIA</p>
                <h3 id="upload-progress-title">
                  {uploadDialog.phase === "done"
                    ? uploadDialog.errors.length > 0
                      ? "Envio concluído com avisos"
                      : "Fotos enviadas"
                    : "Enviando e otimizando"}
                </h3>
              </div>
              <strong className={styles.progressNumber}>
                {Math.round((uploadDialog.completed / Math.max(1, uploadDialog.total)) * 100)}%
              </strong>
            </div>

            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((uploadDialog.completed / Math.max(1, uploadDialog.total)) * 100)}
            >
              <span
                className={styles.progressFill}
                style={{ width: `${Math.round((uploadDialog.completed / Math.max(1, uploadDialog.total)) * 100)}%` }}
              />
            </div>

            <div className={styles.progressMeta}>
              <span>{uploadDialog.completed} de {uploadDialog.total} processadas</span>
              <span>{uploadDialog.successes} enviadas</span>
            </div>

            {uploadDialog.phase === "uploading" ? (
              <div className={styles.currentFile}>
                <span className={styles.spinner} aria-hidden="true" />
                <div>
                  <small>Processando agora</small>
                  <strong title={uploadDialog.currentName}>{uploadDialog.currentName}</strong>
                </div>
              </div>
            ) : (
              <div className={styles.doneSummary}>
                <strong>{uploadDialog.successes} foto(s) pronta(s)</strong>
                <span>
                  {uploadDialog.errors.length === 0
                    ? "Tudo certo. As imagens já estão disponíveis na matéria."
                    : `${uploadDialog.errors.length} arquivo(s) precisam de atenção.`}
                </span>
              </div>
            )}

            {uploadDialog.errors.length > 0 ? (
              <div className={styles.errorList}>
                {uploadDialog.errors.map((error, index) => (
                  <p key={`${error}-${index}`}>{error}</p>
                ))}
              </div>
            ) : null}

            {uploadDialog.phase === "done" ? (
              <button type="button" className={styles.modalClose} onClick={() => setUploadDialog(null)}>
                Concluir
              </button>
            ) : null}
          </section>
        </div>
      ) : null}

      <div className="media-picker-section">
        <div className={styles.mediaListHeading}>
          <p className="field-label">Imagens da matéria ({totalPhotos})</p>
          <div className={styles.helpAnchor} ref={helpAnchorRef}>
            <button className={styles.helpButton} type="button"
              aria-label="O que fazem os ícones das fotos?"
              aria-controls="article-image-actions-help"
              aria-expanded={showActionHelp}
              onClick={() => setShowActionHelp((value) => !value)}
              title="Ajuda sobre os ícones">
              <MediaActionIcon kind="help" />
            </button>
            {showActionHelp ? (
              <div id="article-image-actions-help" className={styles.helpPopover}
                role="dialog" aria-label="Funções dos ícones">
                <div className={styles.helpPopoverHead}>
                  <strong>Funções das fotos</strong>
                  <button type="button" onClick={() => setShowActionHelp(false)}
                    aria-label="Fechar ajuda" title="Fechar">×</button>
                </div>
                <div className={styles.helpPopoverRow}><MediaActionIcon kind="cover" /><span>Definir como capa da matéria</span></div>
                <div className={styles.helpPopoverRow}><MediaActionIcon kind="view" /><span>Visualizar</span></div>
                <div className={styles.helpPopoverRow}><MediaActionIcon kind="edit" /><span>Ajustar / recortar</span></div>
                <div className={styles.helpPopoverRow}><MediaActionIcon kind="replace" /><span>Substituir</span></div>
                <div className={styles.helpPopoverRow}><MediaActionIcon kind="remove" /><span>Remover da matéria</span></div>
              </div>
            ) : null}
          </div>
        </div>
        {editLoading ? <p className="helper-text" role="status">Abrindo imagem para ajuste…</p> : null}
        {editError ? <p className="form-error" role="alert">{editError}</p> : null}
        {orderedMedia.length === 0 ? (
          <p className="helper-text">Nenhuma imagem vinculada a esta matéria.</p>
        ) : (
          <ol className="article-media-list">
            {orderedMedia.map((item, index) => {
              const asset = assetById.get(item.mediaAssetId);
              if (!asset) return null;
              const isCover = item.role === "cover";

              return (
                <li
                  key={item.mediaAssetId}
                  className={`article-media-row ${draggedMediaId === item.mediaAssetId ? "is-dragging" : ""}`}
                  onDragOver={(event) => {
                    if (!draggedMediaId || draggedMediaId === item.mediaAssetId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggedMediaId || draggedMediaId === item.mediaAssetId) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const placement = event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
                    onReorderMedia(draggedMediaId, item.mediaAssetId, placement);
                    setDraggedMediaId(null);
                  }}
                >
                  <button
                    type="button"
                    className="article-media-drag-handle"
                    draggable
                    onDragStart={(event) => {
                      setDraggedMediaId(item.mediaAssetId);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.mediaAssetId);
                    }}
                    onDragEnd={() => setDraggedMediaId(null)}
                    aria-label={`Arrastar ${asset.reference} para reordenar`}
                    title="Arraste para reordenar"
                  >
                    ⋮⋮
                  </button>

                  <div className={`article-media-thumb-wrap ${styles.coverThumbWrapper}`}>
                    <img src={asset.url} alt={asset.altText ?? asset.reference} />
                    <button type="button" className={styles.coverThumbAction}
                      aria-pressed={isCover}
                      aria-label={isCover ? `Capa selecionada: ${asset.reference}` : `Definir ${asset.reference} como capa`}
                      title={isCover ? "Foto de capa selecionada" : "Clique na estrela para escolher esta foto como capa"}
                      disabled={isCover || editLoading || uploading || Boolean(replacing)}
                      onClick={() => onSetCover(item.mediaAssetId)}>
                      <MediaActionIcon kind="cover" />
                    </button>
                    {isCover ? <span className="article-media-cover-badge">CAPA</span> : null}
                  </div>

                  <div className="article-media-info">
                    <span className="materia-reference">{asset.reference}</span>
                    <span className="article-media-position">
                      {isCover ? "Imagem principal" : `Galeria · posição ${index}`}
                    </span>
                  </div>

                  <input
                    className="media-caption-input"
                    value={item.caption ?? ""}
                    onChange={(event) => onSetCaption(item.mediaAssetId, event.target.value)}
                    placeholder={asset.caption ?? "Legenda (opcional)"}
                    aria-label={`Legenda de ${asset.reference}`}
                  />
                  <input
                    className="media-caption-input"
                    value={item.credit ?? ""}
                    onChange={(event) => onSetCredit(item.mediaAssetId, event.target.value)}
                    placeholder={asset.credit ?? "Crédito (opcional)"}
                    aria-label={`Crédito de ${asset.reference}`}
                  />

                  <div className="article-media-row-actions">
                     <button type="button" className="article-media-view" disabled={editLoading || uploading || Boolean(replacing)}
                      onClick={() => setViewerTarget({ role: item.role, order: item.order, mediaAssetId: item.mediaAssetId })}
                      aria-label={`Visualizar ${asset.reference}`} title="Visualizar imagem">
                      <MediaActionIcon kind="view" />
                    </button>
                    <button type="button" className="article-media-view article-media-crop"
                      disabled={editLoading || uploading || Boolean(replacing)}
                      onClick={() => void startEdit(item, asset)}
                      aria-label={`Ajustar ou recortar ${asset.reference}`} title="Ajustar e recortar imagem">
                      <MediaActionIcon kind="edit" />
                    </button>
                    <input type="file" id={"replace-image-" + item.mediaAssetId}
                      accept="image/jpeg,image/png,image/webp,image/avif,image/gif,.avif"
                      className="visually-hidden" disabled={editLoading || uploading || Boolean(replacing)}
                      aria-label={`Selecionar foto para substituir ${asset.reference}`}
                      onChange={(event) => {
                        const replacement = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void replaceImage(item, replacement);
                      }} />
                    <button type="button" className="article-media-view"
                      disabled={editLoading || uploading || Boolean(replacing)}
                      onClick={() => document.getElementById("replace-image-" + item.mediaAssetId)?.click()}
                      aria-label={`Substituir ${asset.reference} por outra foto`} title="Substituir imagem">
                      <MediaActionIcon kind="replace" />
                    </button>
                    <button type="button" className="article-media-view article-media-remove"
                      disabled={editLoading || uploading || Boolean(replacing)}
                      onClick={() => (isCover ? onRemoveCover() : onRemoveFromGallery(item.mediaAssetId))}
                      aria-label={`Remover ${asset.reference} desta matéria`} title="Remover da matéria">
                      <MediaActionIcon kind="remove" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="media-picker-section">
        <p className="field-label">Escolher da biblioteca</p>
        <p className="helper-text">
          Seleção a partir da mídia já cadastrada. Cadastrar mídia nova acontece em{" "}
          <a className="text-link" href="/sistema/editorial/midias" target="_blank" rel="noreferrer">
            Editorial → Mídias
          </a>
          .
        </p>
        <div className="media-upload-actions">
          <input
            type="search"
            className="media-library-search"
            value={librarySearch}
            onChange={(event) => setLibrarySearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleRemoteSearch();
              }
            }}
            placeholder="Procurar por nome, referência, legenda ou crédito"
            aria-label="Procurar mídia na biblioteca"
          />
          <button type="button" onClick={handleRemoteSearch} disabled={searching}>
            {searching ? "Buscando…" : "Buscar no acervo"}
          </button>
        </div>
        {searchNotice ? <p className="helper-text">{searchNotice}</p> : null}
        <div className="library-grid">
          {filteredMediaAssets.map((asset) => {
            const isCover = cover?.mediaAssetId === asset.id;
            const isInGallery = gallery.some((item) => item.mediaAssetId === asset.id);
            return (
              <div key={asset.id} className="library-item">
                <img src={asset.url} alt={asset.altText ?? asset.name ?? asset.reference}
                  title={asset.name || asset.reference} />
                <span className="materia-reference" title={asset.reference}>{asset.reference}</span>
                <div className="library-item-actions">
                  <button
                    type="button"
                    onClick={() => (cover ? onAddToGallery(asset.id) : onSetCover(asset.id))}
                    disabled={isCover || isInGallery}
                  >
                    {isCover || isInGallery ? "Na matéria" : "Adicionar à matéria"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {viewerTarget ? (
        <ArticleImageEditorModal
          asset={assetById.get(viewerTarget.mediaAssetId) as MediaAsset}
          onClose={() => setViewerTarget(null)}
          onSaved={(newAsset) => {
            onReplaceMediaAsset({ role: viewerTarget.role, order: viewerTarget.order }, newAsset);
            // Edições seguintes no mesmo modal (outro crop, outra rotação)
            // partem da derivada recém-criada, nunca refazendo a partir da
            // original — evita empilhar perda de qualidade a cada salvamento.
            setViewerTarget({ ...viewerTarget, mediaAssetId: newAsset.id });
          }}
        />
      ) : null}
    </div>
  );
}
