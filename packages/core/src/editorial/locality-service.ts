import type { Locality } from "@ir/types";
import type { LocalityRepository } from "./locality-repository";

export class LocalityService {
  constructor(private readonly localities: LocalityRepository) {}

  list(): Promise<Locality[]> {
    return this.localities.list();
  }

  getById(id: string): Promise<Locality | null> {
    return this.localities.getById(id);
  }
}
