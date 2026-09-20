import type { Locality } from "@ir/types";

export type NewLocalityRecord = Omit<Locality, "id">;

export type LocalityChanges = Partial<Omit<Locality, "id">>;

export interface LocalityRepository {
  list(): Promise<Locality[]>;
  getById(id: string): Promise<Locality | null>;
  create(record: NewLocalityRecord): Promise<Locality>;
  update(id: string, changes: LocalityChanges): Promise<Locality>;
}
