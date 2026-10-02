import { useRef, useState, useTransition } from "react";
import type { ArticleMedia, MediaAsset } from "@ir/types";
import { searchMediaLibrary, uploadMediaAssets } from "../../app/sistema/editorial/midias/actions";
import styles from "./ArticleMediaPicker.module.css";

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
}: ArticleMediaPickerProps): JSX.Element {
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
          <span className={styles.dropSubtitle}>ou clique para selecionar no computador</span>
          <span className={styles.selectButton}>{uploading ? "Aguarde…" : "Selecionar fotos"}</span>
          <span className={styles.formatHint}>JPEG, PNG, WebP, AVIF ou GIF · até 8 MB por arquivo</span>
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
        <p className="field-label">Imagens da matéria ({totalPhotos})</p>
        {orderedMedia.length === 0 ? (
          <p className="helper-text">Nenhuma imagem vinculada a esta matéria.</p>
        ) : (
          <ol className="article-media-list">
            {orderedMedia.map((item, index) => {
              const asset = assetById.get(item.mediaAssetId);
              if (!asset) return null;
              const isCover = index === 0;

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

                  <div className="article-media-thumb-wrap">
                    <img src={asset.url} alt={asset.altText ?? asset.reference} />
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

                  <button
                    type="button"
                    className="media-remove-button article-media-remove"
                    onClick={() => (isCover ? onRemoveCover() : onRemoveFromGallery(item.mediaAssetId))}
                  >
                    Remover
                  </button>
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
                <img src={asset.url} alt={asset.altText ?? asset.reference} />
                <span className="materia-title">{asset.name}</span>
                <span className="materia-reference">{asset.reference}</span>
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
    </div>
  );
}
