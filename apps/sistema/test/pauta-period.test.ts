import test from "node:test";
import assert from "node:assert/strict";
import { startOfPautaWeek, pautaWeekEnd, dateInPautaPeriod } from "../src/features/agenda/pautaPeriod";

test("Pauta: quinta a quarta, inclusive nas viradas de mês e ano", () => {
  assert.equal(startOfPautaWeek("2026-11-05"), "2026-11-05");
  assert.equal(startOfPautaWeek("2026-11-09"), "2026-11-05");
  assert.equal(startOfPautaWeek("2026-11-11"), "2026-11-05");
  assert.equal(startOfPautaWeek("2026-11-12"), "2026-11-12");
  assert.equal(pautaWeekEnd("2026-11-05"), "2026-11-11");
  assert.equal(startOfPautaWeek("2027-01-01"), "2026-12-31");
  assert.equal(pautaWeekEnd("2026-12-31"), "2027-01-06");
});
test("Pauta: exceção atinge somente o intervalo escolhido", () => {
  assert.ok(dateInPautaPeriod("2026-12-22", "2026-12-17", "2026-12-22"));
  assert.equal(dateInPautaPeriod("2026-12-23", "2026-12-17", "2026-12-22"), false);
  assert.equal(startOfPautaWeek("2026-12-24"), "2026-12-24");
});
