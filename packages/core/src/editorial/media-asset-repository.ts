import type { MediaAsset } from "@ir/types";

/** Dados de uma nova mídia; id, reference e createdAt são atribuídos pelo provider. */
export type NewMediaAssetRecord = Omit<MediaAsset, "id" | "reference" | "createdAt">;

export type MediaAssetChanges = Partial<Omit<MediaAsset, "id" | "reference" | "createdAt">>;

export interface MediaAssetRepository {
  list(): Promise<MediaAsset[]>;
  getById(id: string): Promise<MediaAsset | null>;
  create(record: NewMediaAssetRecord): Promise<MediaAsset>;
  update(id: string, changes: MediaAssetChanges): Promise<MediaAsset>;
}
