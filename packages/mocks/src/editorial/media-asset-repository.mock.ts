import type { MediaAsset } from "@ir/types";
import type { MediaAssetChanges, MediaAssetRepository, NewMediaAssetRecord } from "@ir/core";
import { mediaAssets } from "./data";

/**
 * Provider mock em memória. O estado dura apenas a sessão do módulo que o
 * instanciou; não é persistência real. Cada chamada cria uma cópia isolada
 * dos dados iniciais. Sem storage real: `create` cataloga uma mídia a partir
 * de uma URL já hospedada, nunca recebe um arquivo.
 */
export function createMediaAssetRepositoryMock(
  initialAssets: MediaAsset[] = mediaAssets,
): MediaAssetRepository {
  const store: MediaAsset[] = [...initialAssets];
  let sequence = store.length;

  return {
    async list() {
      return store;
    },
    async getById(id) {
      return store.find((item) => item.id === id) ?? null;
    },
    async create(record: NewMediaAssetRecord) {
      sequence += 1;
      const asset: MediaAsset = {
        ...record,
        id: `media-mock-${sequence}`,
        reference: `IR-MID-2026-${String(sequence).padStart(6, "0")}`,
        createdAt: new Date().toISOString(),
      };
      store.push(asset);
      return asset;
    },
    async update(id, changes: MediaAssetChanges) {
      const index = store.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new Error(`Mídia não encontrada: ${id}`);
      }
      const updated: MediaAsset = { ...store[index], ...changes };
      store[index] = updated;
      return updated;
    },
  };
}
