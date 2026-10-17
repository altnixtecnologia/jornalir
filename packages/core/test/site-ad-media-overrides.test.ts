import { test } from "node:test";
import assert from "node:assert/strict";
import type { SiteAdMedia, SiteAdSlotWithMedia } from "@ir/types";
import { SiteAdMediaValidationError, SiteAdSlotService } from "../src/site-ads/site-ad-slot-service";
import type { SiteAdMediaChanges, SiteAdSlotRepository } from "../src/site-ads/site-ad-slot-repository";

const BASE_MEDIA: SiteAdMedia = {
  id: "media-1",
  slotId: "slot-1",
  mediaAssetId: "asset-1",
  active: true,
  sortOrder: 0,
  createdAt: "2026-10-17T00:00:00Z",
  updatedAt: "2026-10-17T00:00:00Z",
};

function fakeRepository(): SiteAdSlotRepository {
  let lastChanges: SiteAdMediaChanges | null = null;
  return {
    listWithMedia: async (): Promise<SiteAdSlotWithMedia[]> => [],
    setSlotActive: async () => {},
    updateSlot: async () => {},
    addMedia: async () => ({ ...BASE_MEDIA }),
    updateMedia: async (_id: string, changes: SiteAdMediaChanges) => {
      lastChanges = changes;
      return { ...BASE_MEDIA, ...changes, rotationIntervalMs: changes.rotationIntervalMs ?? undefined };
    },
    removeMedia: async () => {},
    reorderMedia: async () => {},
    // Exposto só para as asserções do teste abaixo (não faz parte da interface pública).
    __lastChanges: () => lastChanges,
  } as SiteAdSlotRepository & { __lastChanges: () => SiteAdMediaChanges | null };
}

test("updateMedia aceita um override individual válido (duração, efeito e formato próprios da imagem)", async () => {
  const repository = fakeRepository();
  const service = new SiteAdSlotService(repository);
  const result = await service.updateMedia("media-1", {
    rotationIntervalMs: 5000,
    transitionEffect: "zoom-in",
    fitMode: "stretch",
  });
  assert.equal(result.rotationIntervalMs, 5000);
});

test("updateMedia aceita null explícito para voltar a usar o valor da posição", async () => {
  const repository = fakeRepository();
  const service = new SiteAdSlotService(repository);
  await assert.doesNotReject(() => service.updateMedia("media-1", {
    rotationIntervalMs: null,
    transitionEffect: null,
    fitMode: null,
  }));
});

test("updateMedia rejeita duração de imagem fora da faixa 2-120 segundos", async () => {
  const service = new SiteAdSlotService(fakeRepository());
  await assert.rejects(
    () => service.updateMedia("media-1", { rotationIntervalMs: 500 }),
    SiteAdMediaValidationError,
  );
});

test("updateMedia rejeita efeito de transição inválido para a imagem", async () => {
  const service = new SiteAdSlotService(fakeRepository());
  await assert.rejects(
    () => service.updateMedia("media-1", { transitionEffect: "slide-right" as never }),
    SiteAdMediaValidationError,
  );
});

test("updateMedia rejeita formato de exibição inválido para a imagem", async () => {
  const service = new SiteAdSlotService(fakeRepository());
  await assert.rejects(
    () => service.updateMedia("media-1", { fitMode: "cover" as never }),
    SiteAdMediaValidationError,
  );
});

test("updateMedia nunca valida overrides que não foram informados (undefined não é erro)", async () => {
  const service = new SiteAdSlotService(fakeRepository());
  await assert.doesNotReject(() => service.updateMedia("media-1", { href: "https://exemplo.invalid" }));
});
