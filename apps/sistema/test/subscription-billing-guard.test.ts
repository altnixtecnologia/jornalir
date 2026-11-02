import test from "node:test";
import assert from "node:assert/strict";
import { validateSubscriptionForBilling } from "../src/lib/financeiro/subscriptionBillingGuard";

test("validateSubscriptionForBilling bloqueia geração de cobrança enquanto a assinatura está pendente de formalização", () => {
  const error = validateSubscriptionForBilling("pending_formalization");
  assert.ok(error);
  assert.match(error!, /ative a assinatura/i);
});

test("validateSubscriptionForBilling libera cobrança para assinatura ativa, suspensa ou cancelada (mesmo comportamento já existente — só pending_formalization é novo)", () => {
  assert.equal(validateSubscriptionForBilling("active"), null);
  assert.equal(validateSubscriptionForBilling("suspended"), null);
  assert.equal(validateSubscriptionForBilling("cancelled"), null);
});
