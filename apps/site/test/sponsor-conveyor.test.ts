import { test } from "node:test";
import assert from "node:assert/strict";
import type { PublicSiteAdMedia } from "@ir/types";
import {
  CONVEYOR_PATH,
  SPONSOR_ROTATION_MS,
  SPONSOR_STAGGER_MS,
  buildSponsorPool,
  conveyorSnapshot,
} from "../src/components/site/sponsorConveyor";

const START = 1_762_500_000_000; // instante arbitrário
const STEP_MS = 100; // amostragem fina: pega também os instantes do escalonamento

function sample(poolSize: number, ticks: number): Array<Array<number | null>> {
  const frames: Array<Array<number | null>> = [];
  for (let t = START; t < START + ticks * SPONSOR_ROTATION_MS; t += STEP_MS) frames.push(conveyorSnapshot(t, poolSize));
  return frames;
}

for (const poolSize of [6, 7, 12, 13, 20]) {
  test(`${poolSize} patrocinadores: nunca o mesmo em duas posições ao mesmo tempo (inclusive durante o escalonamento)`, () => {
    for (const frame of sample(poolSize, poolSize * 2)) {
      const shown = frame.filter((index): index is number => index !== null);
      assert.equal(new Set(shown).size, shown.length, `repetido em ${JSON.stringify(frame)}`);
      assert.equal(shown.length, 6, "com 6+ patrocinadores, todas as posições ficam ocupadas");
    }
  });

  test(`${poolSize} patrocinadores: todos passam por todas as posições e ficam o mesmo tempo na tela`, () => {
    const visited = Array.from({ length: poolSize }, () => new Set<number>());
    const screenTime = new Array<number>(poolSize).fill(0);
    // Um ciclo completo exato (poolSize trocas), começando numa troca.
    const cycleStart = Math.ceil(START / SPONSOR_ROTATION_MS) * SPONSOR_ROTATION_MS;
    for (let t = cycleStart; t < cycleStart + poolSize * SPONSOR_ROTATION_MS; t += STEP_MS) {
      conveyorSnapshot(t, poolSize).forEach((index, step) => {
        if (index === null) return;
        visited[index].add(step);
        screenTime[index] += STEP_MS;
      });
    }
    visited.forEach((steps, index) => assert.equal(steps.size, CONVEYOR_PATH.length, `imagem ${index} não passou por todas`));
    const expected = 6 * SPONSOR_ROTATION_MS;
    screenTime.forEach((time, index) => assert.equal(time, expected, `imagem ${index}: ${time}ms na tela`));
  });
}

test("menos de 6 patrocinadores: posições sobrando ficam vazias, nunca repetem, e cada um ainda passa por todas", () => {
  const visited = Array.from({ length: 4 }, () => new Set<number>());
  for (const frame of sample(4, 12)) {
    const shown = frame.filter((index): index is number => index !== null);
    assert.equal(new Set(shown).size, shown.length);
    assert.equal(shown.length, 4);
    frame.forEach((index, step) => index !== null && visited[index].add(step));
  }
  visited.forEach((steps) => assert.equal(steps.size, 6));
});

test("nenhum patrocinador: todas as posições vazias", () => {
  assert.deepEqual(conveyorSnapshot(START, 0), [null, null, null, null, null, null]);
});

test("as posições trocam uma após a outra (escalonadas) quando há 7+; com exatamente 6, juntas", () => {
  const boundary = Math.ceil(START / SPONSOR_ROTATION_MS) * SPONSOR_ROTATION_MS;
  const before = conveyorSnapshot(boundary - 1, 12);
  const justAfter = conveyorSnapshot(boundary + 1, 12);
  assert.notEqual(justAfter[0], before[0], "primeira posição já trocou");
  assert.equal(justAfter[5], before[5], "última ainda não");
  assert.notEqual(conveyorSnapshot(boundary + 5 * SPONSOR_STAGGER_MS + 1, 12)[5], before[5], "última troca 6s depois");
  const six = conveyorSnapshot(boundary + 1, 6);
  const sixBefore = conveyorSnapshot(boundary - 1, 6);
  six.forEach((index, step) => assert.notEqual(index, sixBefore[step]));
});

test("fila única: grupos 1→6 na ordem, 'Anuncie aqui' entra como patrocinador, imagem repetida entra uma vez", () => {
  const media = (slotNumber: number, id: string, imageUrl: string): PublicSiteAdMedia => ({
    slotNumber,
    id,
    imageUrl,
    sortOrder: 0,
    rotationIntervalMs: 30000,
    transitionEffect: "fade",
    fitMode: "contain",
  });
  const pool = buildSponsorPool(
    new Map([
      [2, [media(2, "b", "/b.webp")]],
      [1, [media(1, "a", "/a.webp"), media(1, "anuncie", "/anuncie-aqui.webp")]],
      [3, [media(3, "a-dup", "/a.webp")]],
    ]),
  );
  assert.deepEqual(pool.map((item) => item.id), ["a", "anuncie", "b"]);
  assert.ok(pool.every((item) => item.rotateMs === SPONSOR_ROTATION_MS), "tempo individual da imagem não vale mais");
});
