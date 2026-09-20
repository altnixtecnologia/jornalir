import type { MediaAsset } from "@ir/types";
import type { MediaAssetRepository } from "./media-asset-repository";

/** Somente leitura nesta fase: sem upload real, sem storage. */
export class MediaAssetService {
  constructor(private readonly mediaAssets: MediaAssetRepository) {}

  list(): Promise<MediaAsset[]> {
    return this.mediaAssets.list();
  }

  getById(id: string): Promise<MediaAsset | null> {
    return this.mediaAssets.getById(id);
  }
}
