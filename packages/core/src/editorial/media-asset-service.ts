import type { MediaAsset } from "@ir/types";
import type { MediaAssetChanges, MediaAssetRepository, NewMediaAssetRecord } from "./media-asset-repository";

export class MediaAssetNotFoundError extends Error {
  constructor(id: string) {
    super(`Mídia não encontrada: ${id}`);
  }
}

export interface RegisterMediaAssetInput {
  name: string;
  /** Sem storage real nesta fase: a URL precisa já apontar para uma imagem hospedada. */
  url: string;
  altText?: string;
  caption?: string;
  credit?: string;
  capturedAt?: string;
  width?: number;
  height?: number;
}

export interface UpdateMediaAssetInput {
  name?: string;
  url?: string;
  altText?: string;
  caption?: string;
  credit?: string;
  capturedAt?: string;
}

/**
 * Biblioteca de mídia. Ainda sem storage real nesta fase: `register` cataloga
 * uma imagem por referência (URL já hospedada), nunca recebe nem grava um
 * arquivo. Vínculo com matéria (quando houver) é responsabilidade de quem lê
 * `ArticleService.list()` e cruza com `mediaAssetId` — não é um campo
 * armazenado aqui, para não duplicar a fonte de verdade.
 */
export class MediaAssetService {
  constructor(private readonly mediaAssets: MediaAssetRepository) {}

  list(): Promise<MediaAsset[]> {
    return this.mediaAssets.list();
  }

  async getById(id: string): Promise<MediaAsset> {
    const asset = await this.mediaAssets.getById(id);
    if (!asset) {
      throw new MediaAssetNotFoundError(id);
    }
    return asset;
  }

  register(input: RegisterMediaAssetInput): Promise<MediaAsset> {
    const record: NewMediaAssetRecord = {
      name: input.name.trim(),
      url: input.url.trim(),
      altText: input.altText?.trim() || undefined,
      caption: input.caption?.trim() || undefined,
      credit: input.credit?.trim() || undefined,
      capturedAt: input.capturedAt || undefined,
      width: input.width,
      height: input.height,
    };
    return this.mediaAssets.create(record);
  }

  async update(id: string, input: UpdateMediaAssetInput): Promise<MediaAsset> {
    await this.getById(id);
    const changes: MediaAssetChanges = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.url !== undefined) changes.url = input.url.trim();
    if (input.altText !== undefined) changes.altText = input.altText.trim() || undefined;
    if (input.caption !== undefined) changes.caption = input.caption.trim() || undefined;
    if (input.credit !== undefined) changes.credit = input.credit.trim() || undefined;
    if (input.capturedAt !== undefined) changes.capturedAt = input.capturedAt || undefined;
    return this.mediaAssets.update(id, changes);
  }
}
