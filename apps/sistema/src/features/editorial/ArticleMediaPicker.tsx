import { useRef, useState, useTransition } from "react";
import type { ArticleMedia, MediaAsset } from "@ir/types";
import { uploadMediaAssets } from "../../app/sistema/editorial/midias/actions";

interface ArticleMediaPickerProps {
  mediaAssets: MediaAsset[];
  media: ArticleMedia[];
  onSetCover: (mediaAssetId: string) => void;
  onRemoveCover: () => void;
  onAddToGallery: (mediaAssetId: string) => void;
  onRemoveFromGallery: (mediaAssetId: string) => void;
  onMoveGalleryItem: (mediaAssetId: string, direction: -1 | 1) => void;
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
  onMoveGalleryItem,
  onSetCaption,
  onSetCredit,
  onFilesUploaded,
}: ArticleMediaPickerProps): JSX.Element {
  const assetById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const cover = media.find((item) => item.role === "cover");
  const coverAsset = cover ? assetById.get(cover.mediaAssetId) : undefined;
  const gallery = media
    .filter((item) => item.role === "gallery")
    .sort((a, b) => a.order - b.order);
  const totalPhotos = media.length;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const [librarySearch, setLibrarySearch] = useState("");
  const filteredMediaAssets = librarySearch.trim()
    ? mediaAssets.filter((asset) => {
        const term = librarySearch.trim().toLowerCase();
        return `${asset.name} ${asset.reference}`.toLowerCase().includes(term);
      })
    : mediaAssets;

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files;
    event.target.value = "";
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const file of Array.from(files)) formData.append("files", file);

    setUploadNotice(`Enviando ${files.length} foto(s)…`);
    startUpload(async () => {
      const result = await uploadMediaAssets(formData);
      if ("error" in result) {
        setUploadNotice(result.error);
        return;
      }
      onFilesUploaded(result.assets);
      const okCount = result.assets.length;
      const warningsText = result.warnings.length > 0 ? ` (${result.warnings.join("; ")})` : "";
      setUploadNotice(`${okCount} foto(s) enviada(s) e vinculada(s).${warningsText}`);
    });
  }

  return (
    <div className="media-picker">
      <div className="media-picker-section">
        <p className="field-label">Adicionar fotos</p>
        <p className="helper-text">
          Nenhuma, uma ou várias. Com 1 foto: capa normal, sem galeria pública. Com 2 ou mais: galeria
          pública fica disponível na matéria.
        </p>
        <div className="media-upload-actions">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Enviando…" : "Enviar fotos"}
          </button>
          <span className="helper-text media-upload-hint">
            ou escolha da biblioteca cadastrada, mais abaixo
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="visually-hidden"
          onChange={handleFilesSelected}
        />
        {uploadNotice ? <p className="helper-text upload-notice">{uploadNotice}</p> : null}
      </div>

      <div className="media-picker-section">
        <p className="field-label">Imagem de capa</p>
        {coverAsset ? (
          <div className="media-slot">
            <img src={coverAsset.url} alt={coverAsset.altText ?? coverAsset.reference} />
            <div className="media-slot-fields">
              <span className="materia-reference">{coverAsset.reference}</span>
              <input
                className="media-caption-input"
                value={cover?.caption ?? ""}
                onChange={(event) => onSetCaption(coverAsset.id, event.target.value)}
                placeholder={coverAsset.caption ?? "Legenda (opcional)"}
                aria-label={`Legenda da capa ${coverAsset.reference}`}
              />
              <input
                className="media-caption-input"
                value={cover?.credit ?? ""}
                onChange={(event) => onSetCredit(coverAsset.id, event.target.value)}
                placeholder={coverAsset.credit ?? "Crédito (opcional)"}
                aria-label={`Crédito da capa ${coverAsset.reference}`}
              />
              <button type="button" className="media-remove-button" onClick={onRemoveCover}>
                Remover capa
              </button>
            </div>
          </div>
        ) : (
          <p className="helper-text">Nenhuma capa selecionada. Escolha uma imagem na biblioteca abaixo.</p>
        )}
      </div>

      <div className="media-picker-section">
        <p className="field-label">Galeria ({gallery.length})</p>
        {gallery.length === 0 ? (
          <p className="helper-text">
            {totalPhotos === 1
              ? "Só a capa por enquanto — com 1 foto só, a galeria pública não aparece na matéria."
              : "Nenhuma imagem na galeria ainda."}
          </p>
        ) : (
          <ol className="gallery-list">
            {gallery.map((item, index) => {
              const asset = assetById.get(item.mediaAssetId);
              if (!asset) return null;
              return (
                <li key={item.mediaAssetId} className="gallery-item">
                  <img src={asset.url} alt={asset.altText ?? asset.reference} />
                  <span className="materia-reference">{asset.reference}</span>
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
                  <div className="gallery-item-actions">
                    <button
                      type="button"
                      onClick={() => onMoveGalleryItem(item.mediaAssetId, -1)}
                      disabled={index === 0}
                      aria-label={`Mover ${asset.reference} para cima`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveGalleryItem(item.mediaAssetId, 1)}
                      disabled={index === gallery.length - 1}
                      aria-label={`Mover ${asset.reference} para baixo`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="media-remove-button"
                      onClick={() => onRemoveFromGallery(item.mediaAssetId)}
                    >
                      Remover
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
        <input
          type="search"
          className="media-library-search"
          value={librarySearch}
          onChange={(event) => setLibrarySearch(event.target.value)}
          placeholder="Procurar por nome ou referência"
          aria-label="Procurar mídia na biblioteca"
        />
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
                  <button type="button" onClick={() => onSetCover(asset.id)} disabled={isCover}>
                    {isCover ? "Capa atual" : "Definir como capa"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddToGallery(asset.id)}
                    disabled={isInGallery}
                  >
                    {isInGallery ? "Na galeria" : "Adicionar à galeria"}
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
