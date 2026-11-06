import test from "node:test";
import assert from "node:assert/strict";
import {
  nextDayAt7AmSaoPauloIso,
  saoPauloLocalInputToUtcIso,
  utcIsoToSaoPauloLocalInput,
} from "../src/lib/editorial/editionAvailabilityScheduling";

/**
 * America/Sao_Paulo é UTC-3 o ano inteiro desde a abolição do horário de
 * verão em 2019 — 07:00 local = 10:00 UTC, sempre, sem exceção sazonal.
 */
test("nextDayAt7AmSaoPauloIso: 07:00 America/Sao_Paulo do dia seguinte é 10:00 UTC", () => {
  const from = new Date("2026-11-06T18:00:00.000Z"); // 15:00 em São Paulo
  const result = nextDayAt7AmSaoPauloIso(from);
  assert.equal(result, "2026-11-07T10:00:00.000Z");
});

test("nextDayAt7AmSaoPauloIso: upload de madrugada (UTC) ainda cai no dia civil correto em São Paulo", () => {
  // 2026-11-07T02:00:00Z = 2026-11-06T23:00 em São Paulo (ainda dia 06) —
  // o dia seguinte civil em São Paulo é 07, não 08.
  const from = new Date("2026-11-07T02:00:00.000Z");
  const result = nextDayAt7AmSaoPauloIso(from);
  assert.equal(result, "2026-11-07T10:00:00.000Z");
});

test("saoPauloLocalInputToUtcIso converte um datetime-local (America/Sao_Paulo) para ISO UTC", () => {
  assert.equal(saoPauloLocalInputToUtcIso("2026-11-07T07:00"), "2026-11-07T10:00:00.000Z");
  assert.equal(saoPauloLocalInputToUtcIso("2026-12-24T23:30"), "2026-12-25T02:30:00.000Z");
});

test("saoPauloLocalInputToUtcIso rejeita um valor sem o formato esperado", () => {
  assert.equal(saoPauloLocalInputToUtcIso("não é uma data"), null);
  assert.equal(saoPauloLocalInputToUtcIso(""), null);
});

test("utcIsoToSaoPauloLocalInput é o inverso exato de saoPauloLocalInputToUtcIso", () => {
  const original = "2026-11-07T07:00";
  const utc = saoPauloLocalInputToUtcIso(original);
  assert.ok(utc);
  assert.equal(utcIsoToSaoPauloLocalInput(utc as string), original);
});
