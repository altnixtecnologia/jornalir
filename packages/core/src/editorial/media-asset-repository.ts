import type { MediaAsset } from "@ir/types";

export interface MediaAssetRepository {
  list(): Promise<MediaAsset[]>;
  getById(id: string): Promise<MediaAsset | null>;
}
