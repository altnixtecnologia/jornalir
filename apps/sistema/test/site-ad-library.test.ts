import { test } from "node:test";
import assert from "node:assert/strict";
import type { SiteAdSlotWithMedia } from "@ir/types";
import { buildSiteAdLibrary } from "../src/features/configuracoes/siteAdLibrary";

function slot(number: number, active: boolean, imageCount: number): SiteAdSlotWithMedia {
  return {
    id: "slot-" + number,
    slotNumber: number,
    active,
    media: Array.from({ length: imageCount }, (_, index) => ({
      id: "image-" + number + "-" + index,
      slotId: "slot-" + number,
      sortOrder: index,
      active: true,
    })),
  } as unknown as SiteAdSlotWithMedia;
}

test("consolida as 12 imagens já distribuídas nos seis slots, sem alterar sua origem", () => {
  const slots = Array.from({ length: 6 }, (_, index) => slot(index + 1, true, 2)).reverse();
  const before = JSON.stringify(slots);
  const library = buildSiteAdLibrary(slots);
  assert.equal(library.entries.length, 12);
  assert.equal(library.uploadSlot?.id, "slot-1");
  assert.deepEqual(library.entries.map(({ media }) => media.id).slice(0, 3),
    ["image-1-0", "image-1-1", "image-2-0"]);
  assert.equal(JSON.stringify(slots), before, "o modelo não pode modificar os cadastros");
});

test("usa o primeiro slot interno ativo sem pedir posição ao usuário", () => {
  const library = buildSiteAdLibrary([slot(1, false, 2), slot(2, true, 1)]);
  assert.equal(library.uploadSlot?.id, "slot-2");
  assert.equal(library.entries.length, 3, "mostra inclusive imagens antigas de um slot desativado");
});

test("não tenta cadastrar em posição desativada e aceita acervo vazio", () => {
  assert.equal(buildSiteAdLibrary([slot(1, false, 0)]).uploadSlot, null);
  assert.deepEqual(buildSiteAdLibrary([]), { entries: [], uploadSlot: null });
});
