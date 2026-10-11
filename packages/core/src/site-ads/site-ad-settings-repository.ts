import type { SiteAdSettings, SiteAdTransitionEffect } from "@ir/types";

export interface SiteAdSettingsChanges {
  rotationIntervalMs?: number;
  transitionEffect?: SiteAdTransitionEffect;
}

export interface SiteAdSettingsRepository {
  /** Singleton por convenção — sempre existe uma linha (seed na migration), nunca um id fixo assumido. */
  getCurrent(): Promise<SiteAdSettings>;
  update(id: string, changes: SiteAdSettingsChanges): Promise<SiteAdSettings>;
}
