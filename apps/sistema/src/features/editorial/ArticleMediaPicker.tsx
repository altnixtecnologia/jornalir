import type { ArticleMedia, MediaAsset } from "@ir/types";

interface ArticleMediaPickerProps {
  mediaAssets: MediaAsset[];
  media: ArticleMedia[];
  onSetCover: (mediaAssetId: string) => void;
  onRemoveCover: () => void;
  onAddToGallery: (mediaAssetId: string) => void;
  onRemoveFromGallery: (mediaAssetId: string) => void;
  onMoveGalleryItem: (mediaAssetId: string, direction: -1 | 1) => void;
}

export function ArticleMediaPicker({
  mediaAssets,
  media,
  onSetCover,
  onRemoveCover,
  onAddToGallery,
  onRemoveFromGallery,
  onMoveGalleryItem,
}: ArticleMediaPickerProps): JSX.Element {
  const assetById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const cover = media.find((item) => item.role === "cover");
  const coverAsset = cover ? assetById.get(cover.mediaAssetId) : undefined;
  const gallery = media
    .filter((item) => item.role === "gallery")
    .sort((a, b) => a.order - b.order);

  return (
    <div className="media-picker">
      <div className="media-picker-section">
        <p className="field-label">Imagem de capa</p>
        {coverAsset ? (
          <div className="media-slot">
            <img src={coverAsset.url} alt={coverAsset.altText ?? coverAsset.reference} />
            <div>
              <span className="materia-reference">{coverAsset.reference}</span>
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
          <p className="helper-text">Nenhuma imagem na galeria ainda.</p>
        ) : (
          <ol className="gallery-list">
            {gallery.map((item, index) => {
              const asset = assetById.get(item.mediaAssetId);
              if (!asset) return null;
              return (
                <li key={item.mediaAssetId} className="gallery-item">
                  <img src={asset.url} alt={asset.altText ?? asset.reference} />
                  <span className="materia-reference">{asset.reference}</span>
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
        <p className="field-label">Biblioteca de mídia</p>
        <p className="helper-text">
          Seleção a partir da mídia já disponível. Envio de novas imagens chega em uma
          próxima etapa.
        </p>
        <div className="library-grid">
          {mediaAssets.map((asset) => {
            const isCover = cover?.mediaAssetId === asset.id;
            const isInGallery = gallery.some((item) => item.mediaAssetId === asset.id);
            return (
              <div key={asset.id} className="library-item">
                <img src={asset.url} alt={asset.altText ?? asset.reference} />
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
