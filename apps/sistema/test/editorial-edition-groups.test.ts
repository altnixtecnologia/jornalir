import test from "node:test";
import assert from "node:assert/strict";
import { pickRecentEditionIds } from "../src/features/editorial/recentEditionGroups";

test("mostra a edição 777 acima da 776 mesmo se foram cadastradas fora de ordem", () => {
  const editions = [
    { id: "e776", editionNumber: 776 }, { id: "e777", editionNumber: 777 }, { id: "e775", editionNumber: 775 },
  ];
  const linked = [{ newspaper_edition_id: "e776" }, { newspaper_edition_id: "e777" }, { newspaper_edition_id: "e776" }];
  assert.deepEqual(pickRecentEditionIds(linked, editions), ["e777", "e776"]);
  assert.deepEqual(pickRecentEditionIds(linked, editions, 1), ["e777"]);
});
test("não mistura artigos históricos sem edição", () => {
  const editions = [{ id: "e777", editionNumber: 777 }];
  assert.deepEqual(pickRecentEditionIds([{ newspaper_edition_id: null }], editions), []);
});
