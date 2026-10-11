import { SITE_AD_TRANSITION_EFFECTS, type SiteAdSettings, type SiteAdTransitionEffect } from "@ir/types";
import type { SiteAdSettingsRepository } from "./site-ad-settings-repository";

export class SiteAdSettingsValidationError extends Error {}

export interface SiteAdSettingsInput {
  rotationIntervalMs: number;
  transitionEffect: SiteAdTransitionEffect;
}

function assertValid(input: SiteAdSettingsInput): void {
  if (!Number.isFinite(input.rotationIntervalMs) || input.rotationIntervalMs < 2000 || input.rotationIntervalMs > 120000) {
    throw new SiteAdSettingsValidationError("Informe um intervalo de rotação entre 2 e 120 segundos.");
  }
  if (!SITE_AD_TRANSITION_EFFECTS.includes(input.transitionEffect)) {
    throw new SiteAdSettingsValidationError("Efeito de transição inválido.");
  }
}

/** Configuração GLOBAL de rotação/efeito — vale para os 6 slots ao mesmo tempo (nunca por imagem individual). */
export class SiteAdSettingsService {
  constructor(private readonly repository: SiteAdSettingsRepository) {}

  getCurrent(): Promise<SiteAdSettings> {
    return this.repository.getCurrent();
  }

  async update(id: string, input: SiteAdSettingsInput): Promise<SiteAdSettings> {
    assertValid(input);
    return this.repository.update(id, input);
  }
}
