import type { Locality } from "@ir/types";

export interface LocalityRepository {
  list(): Promise<Locality[]>;
  getById(id: string): Promise<Locality | null>;
}
