import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildContractTimeline,
  canTransitionContractStatus,
  computeContractBudgetFlag,
  computeContractVigencyFlag,
  computeEffectiveContractAmount,
  computeEffectiveContractEndsAt,
} from "../src/financeiro";

// Bloco 2 — Contratos Institucionais: status coerentes, alertas
// derivados, aditivos com redução e linha do tempo.

test("status: active -> suspended é permitido, terminated -> active não é", () => {
  assert.equal(canTransitionContractStatus("active", "suspended"), true);
  assert.equal(canTransitionContractStatus("terminated", "active"), false);
  assert.equal(canTransitionContractStatus("cancelled", "active"), false);
});

test("vigência: contrato ativo com fim no passado => expired; sem fim => null", () => {
  const today = new Date("2026-10-15T00:00:00");
  assert.equal(computeContractVigencyFlag("2026-09-01", "active", today), "expired");
  assert.equal(computeContractVigencyFlag(undefined, "active", today), null);
});

test("vigência: contrato terminated nunca mostra alerta de vigência, mesmo com fim no passado", () => {
  const today = new Date("2026-10-15T00:00:00");
  assert.equal(computeContractVigencyFlag("2026-09-01", "terminated", today), null);
});

test("orçamento: lançado acima do vigente => over_limit; 90%+ => near_limit; abaixo => null", () => {
  assert.equal(computeContractBudgetFlag(1100, 1000), "over_limit");
  assert.equal(computeContractBudgetFlag(950, 1000), "near_limit");
  assert.equal(computeContractBudgetFlag(500, 1000), null);
});

test("aditivo com valor negativo reduz o valor vigente (nunca sobrescreve o original)", () => {
  const effective = computeEffectiveContractAmount(1000, [{ amount: 200 }, { amount: -300 }]);
  assert.equal(effective, 900);
});

test("aditivo sem newEndsAt não muda a vigência vigente", () => {
  const endsAt = computeEffectiveContractEndsAt("2026-12-31", [{ newEndsAt: undefined }, { newEndsAt: "2027-06-30" }]);
  assert.equal(endsAt, "2027-06-30");
});

test("linha do tempo sai ordenada por data, mesmo recebendo os eventos fora de ordem", () => {
  const timeline = buildContractTimeline({
    startsAt: "2026-01-01",
    status: "active",
    documents: [{ name: "Contrato original", documentDate: "2026-01-01", createdAt: "2026-01-01T10:00:00Z", documentType: "contract" }],
    amendments: [{ amount: 100, effectiveDate: "2026-06-01", createdAt: "2026-06-01T10:00:00Z", amendmentNumber: "1" }],
    commitmentOrders: [{ number: "001/2026", issueDate: "2026-02-01", amount: 500 }],
    receivables: [{ reference: "IR-REC-001", issueDate: "2026-03-01", originalAmount: 100 }],
    receipts: [{ reference: "IR-REC-001", amount: 100, receivedAt: "2026-03-10" }],
  });
  const dates = timeline.map((entry) => entry.date);
  const sorted = [...dates].sort();
  assert.deepEqual(dates, sorted);
  assert.equal(timeline.length, 6);
});
