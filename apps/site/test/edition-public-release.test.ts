import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isEditionPubliclyReleased } from "../src/lib/public/editionPublicRelease";

const released = { active: true, available_at: "2026-11-12T10:00:00.000Z" };
const NOW = Date.parse("2026-11-18T15:00:00.000Z");

test("edições publicadas continuam visíveis após a disponibilização", () => {
  assert.equal(isEditionPubliclyReleased(released, NOW), true);
  // A edição continua pública mesmo quando uma operação posterior está em atenção.
  assert.equal(isEditionPubliclyReleased({ ...released }, NOW), true);
});

test("active=true não libera rascunho, preparação ou disponibilidade futura", () => {
  assert.equal(isEditionPubliclyReleased({ active: true, available_at: null }, NOW), false);
  assert.equal(isEditionPubliclyReleased({ active: true, available_at: undefined }, NOW), false);
  assert.equal(isEditionPubliclyReleased({ active: true, available_at: "2026-11-19T10:00:00.000Z" }, NOW), false);
  assert.equal(isEditionPubliclyReleased({ active: true, available_at: "invalida" }, NOW), false);
  assert.equal(isEditionPubliclyReleased({ active: false, available_at: "2026-11-12T10:00:00.000Z" }, NOW), false);
});

test("o catálogo público filtra no banco e novamente antes do mapeamento", () => {
  const source = readFileSync(new URL("../src/app/api/jornal-online/editions/route.ts", import.meta.url), "utf8");
  assert.match(source, /\.eq\("active", true\)/);
  assert.match(source, /\.lte\("available_at", new Date\(nowMs\)\.toISOString\(\)\)/);
  assert.match(source, /\.filter\(\(edition\) => isEditionPubliclyReleased\(edition, nowMs\)\)/);
  assert.match(source, /\.map\(mapEditionRow\)/);
  // Não há alterações destrutivas de cadastros ou acervo.
  assert.doesNotMatch(source, /\.delete\(|\.update\(|\.upsert\(/);
});
