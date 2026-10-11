import type { SiteAdMedia, SiteAdSlotWithMedia } from "@ir/types";
import type { NewSiteAdMediaRecord, SiteAdMediaChanges, SiteAdSlotRepository } from "./site-ad-slot-repository";

export class SiteAdMediaValidationError extends Error {}

export interface SiteAdMediaInput {
  slotId: string;
  mediaAssetId: string;
  clientId?: string;
  href?: string;
  altText?: string;
  activeFrom?: string;
  activeUntil?: string;
}

function trimOrUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function assertValid(input: Pick<SiteAdMediaInput, "slotId" | "mediaAssetId" | "activeFrom" | "activeUntil">): void {
  if (!input.slotId) throw new SiteAdMediaValidationError("Selecione a posição.");
  if (!input.mediaAssetId) throw new SiteAdMediaValidationError("Selecione a imagem.");
  if (input.activeFrom && input.activeUntil && input.activeUntil < input.activeFrom) {
    throw new SiteAdMediaValidationError("O fim do período não pode ser anterior ao início.");
  }
}

/**
 * Playlist das 6 posições de publicidade do site — benefício/brinde
 * (nunca uma venda, ver comentário na migration). Adicionar/remover/
 * reordenar mídia é operação normal; ativar/desativar um slot inteiro
 * é mais raro (ex.: manutenção) mas nunca remove as mídias já cadastradas.
 */
export class SiteAdSlotService {
  constructor(private readonly repository: SiteAdSlotRepository) {}

  listWithMedia(): Promise<SiteAdSlotWithMedia[]> {
    return this.repository.listWithMedia();
  }

  setSlotActive(slotId: string, active: boolean): Promise<void> {
    return this.repository.setSlotActive(slotId, active);
  }

  async addMedia(input: SiteAdMediaInput, sortOrder: number): Promise<SiteAdMedia> {
    assertValid(input);
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
    return this.repository.updateMedia(id, changes);
  }

  removeMedia(id: string): Promise<void> {
    return this.repository.removeMedia(id);
  }

  reorderMedia(slotId: string, orderedMediaIds: string[]): Promise<void> {
    return this.repository.reorderMedia(slotId, orderedMediaIds);
  }
}
