import {
  SITE_AD_SLOT_TRANSITION_EFFECTS,
  type SiteAdFitMode,
  type SiteAdMedia,
  type SiteAdSlotTransitionEffect,
  type SiteAdSlotWithMedia,
} from "@ir/types";
import type {
  NewSiteAdMediaRecord,
  SiteAdMediaChanges,
  SiteAdSlotRepository,
} from "./site-ad-slot-repository";

export class SiteAdMediaValidationError extends Error {}
export class SiteAdSlotValidationError extends Error {}

export interface SiteAdMediaInput {
  slotId: string;
  mediaAssetId: string;
  clientId?: string;
  href?: string;
  altText?: string;
  activeFrom?: string;
  activeUntil?: string;
}

export interface SiteAdSlotSettingsInput {
  rotationIntervalMs: number;
  transitionEffect: SiteAdSlotTransitionEffect;
  fitMode: SiteAdFitMode;
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function assertMediaValid(input: Pick<SiteAdMediaInput, "slotId" | "mediaAssetId" | "activeFrom" | "activeUntil">): void {
  if (!input.slotId) throw new SiteAdMediaValidationError("Selecione a posição.");
  if (!input.mediaAssetId) throw new SiteAdMediaValidationError("Selecione a imagem.");
  if (input.activeFrom && input.activeUntil && input.activeUntil < input.activeFrom) {
    throw new SiteAdMediaValidationError("O fim do período não pode ser anterior ao início.");
  }
}

function assertSlotSettings(input: SiteAdSlotSettingsInput): void {
  if (!Number.isFinite(input.rotationIntervalMs) || input.rotationIntervalMs < 2000 || input.rotationIntervalMs > 120000) {
    throw new SiteAdSlotValidationError("Informe um tempo entre 2 e 120 segundos.");
  }
  if (!SITE_AD_SLOT_TRANSITION_EFFECTS.includes(input.transitionEffect)) {
    throw new SiteAdSlotValidationError("Efeito de transição inválido.");
  }
  if (input.fitMode !== "contain" && input.fitMode !== "stretch") {
    throw new SiteAdSlotValidationError("Formato de exibição inválido.");
  }
}

// Overrides por imagem aceitam null (volta a usar o valor da posição) — só valida quando um
// valor de fato foi informado (null/undefined nunca disparam erro de validação).
function assertMediaOverrides(changes: Pick<SiteAdMediaChanges, "rotationIntervalMs" | "transitionEffect" | "fitMode">): void {
  if (changes.rotationIntervalMs != null && (!Number.isFinite(changes.rotationIntervalMs) || changes.rotationIntervalMs < 2000 || changes.rotationIntervalMs > 120000)) {
    throw new SiteAdMediaValidationError("Informe um tempo entre 2 e 120 segundos para esta imagem.");
  }
  if (changes.transitionEffect != null && !SITE_AD_SLOT_TRANSITION_EFFECTS.includes(changes.transitionEffect)) {
    throw new SiteAdMediaValidationError("Efeito de transição inválido para esta imagem.");
  }
  if (changes.fitMode != null && changes.fitMode !== "contain" && changes.fitMode !== "stretch") {
    throw new SiteAdMediaValidationError("Formato de exibição inválido para esta imagem.");
  }
}

export class SiteAdSlotService {
  constructor(private readonly repository: SiteAdSlotRepository) {}

  listWithMedia(): Promise<SiteAdSlotWithMedia[]> {
    return this.repository.listWithMedia();
  }

  setSlotActive(slotId: string, active: boolean): Promise<void> {
    return this.repository.setSlotActive(slotId, active);
  }

  async updateSlotSettings(slotId: string, input: SiteAdSlotSettingsInput): Promise<void> {
    assertSlotSettings(input);
    return this.repository.updateSlot(slotId, input);
  }

  async addMedia(input: SiteAdMediaInput, sortOrder: number): Promise<SiteAdMedia> {
    assertMediaValid(input);
    const record: NewSiteAdMediaRecord = {
      slotId: input.slotId,
      mediaAssetId: input.mediaAssetId,
      clientId: trimOrUndefined(input.clientId),
      href: trimOrUndefined(input.href),
      altText: trimOrUndefined(input.altText),
      active: true,
      activeFrom: trimOrUndefined(input.activeFrom),
      activeUntil: trimOrUndefined(input.activeUntil),
      sortOrder,
    };
    return this.repository.addMedia(record);
  }

  async updateMedia(id: string, changes: SiteAdMediaChanges): Promise<SiteAdMedia> {
    if (changes.activeFrom && changes.activeUntil && changes.activeUntil < changes.activeFrom) {
      throw new SiteAdMediaValidationError("O fim do período não pode ser anterior ao início.");
    }
    assertMediaOverrides(changes);
    return this.repository.updateMedia(id, changes);
  }

  removeMedia(id: string): Promise<void> {
    return this.repository.removeMedia(id);
  }

  reorderMedia(slotId: string, orderedMediaIds: string[]): Promise<void> {
    return this.repository.reorderMedia(slotId, orderedMediaIds);
  }
}
