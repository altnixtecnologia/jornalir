import type { MediaAsset } from "@ir/types";
import type { MediaAssetRepository } from "@ir/core";
import { mediaAssets } from "./data";

export function createMediaAssetRepositoryMock(
  items: MediaAsset[] = mediaAssets,
): MediaAssetRepository {
  return {
    async list() {
      return items;
    },
    async getById(id) {
      return items.find((item) => item.id === id) ?? null;
    },
  };
}
