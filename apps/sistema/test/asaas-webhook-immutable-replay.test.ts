import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesStoredAsaasEvent } from "../src/lib/financeiro/asaasWebhookEventIdentity";

const original = {
  provider: "asaas",
  event_type: "PAYMENT_RECEIVED",
  provider_charge_id: "pay_123",
};

test("reentrega legítima com mesmo ID/tipo/cobrança mantém a identidade", () => {
  assert.equal(matchesStoredAsaasEvent(original, {
    eventType: "PAYMENT_RECEIVED", providerChargeId: "pay_123",
  }), true);
});

test("não aceitar o mesmo evento como cancelamento após pagamento", () => {
  assert.equal(matchesStoredAsaasEvent(original, {
    eventType: "PAYMENT_DELETED", providerChargeId: "pay_123",
  }), false);
});

test("não aceitar a mesma identificação para cobrar/baixar outro pagamento", () => {
  assert.equal(matchesStoredAsaasEvent(original, {
    eventType: "PAYMENT_RECEIVED", providerChargeId: "pay_456",
  }), false);
});

test("nulo e ID real são identidades diferentes, inclusive eventos sem payment.id", () => {
  const noCharge = { ...original, provider_charge_id: null };
  assert.equal(matchesStoredAsaasEvent(noCharge, {
    eventType: "PAYMENT_RECEIVED", providerChargeId: null,
  }), true);
  assert.equal(matchesStoredAsaasEvent(noCharge, {
    eventType: "PAYMENT_RECEIVED", providerChargeId: "pay_123",
  }), false);
});

test("não reutilizar identificação persistida de outro provedor", () => {
  assert.equal(matchesStoredAsaasEvent({ ...original, provider: "outro" }, {
    eventType: "PAYMENT_RECEIVED", providerChargeId: "pay_123",
  }), false);
});

test("a rota autentica antes de checar evento, compara antes de processado e mantém a reserva exclusiva", () => {
  const source = readFileSync(new URL("../src/app/api/integrations/asaas/webhook/route.ts", import.meta.url), "utf8");
  const authenticated = source.indexOf("constantTimeEquals(receivedToken, expectedToken)");
  const initialLookup = source.indexOf('.select("id, processed_at, provider, event_type, provider_charge_id")');
  const initialCheck = source.indexOf("if (previous && !matchesStoredAsaasEvent(");
  const duplicate = source.indexOf("if (previous?.processed_at)");
  const inserted = source.indexOf('if (!previous) {');
  const concurrent = source.indexOf('insertError?.code === "23505"');
  const concurCheck = source.indexOf("if (!matchesStoredAsaasEvent(concurrentlyInserted");
  const claim = source.indexOf(".update({ processing_token: processingToken, processing_at:");
  const payment = source.indexOf('const plan = cardWebhookPlan(');
  assert.ok(authenticated >= 0 && initialLookup > authenticated);
  assert.ok(initialCheck > initialLookup && duplicate > initialCheck);
  assert.ok(inserted > duplicate && concurrent > inserted && concurCheck > concurrent);
  assert.ok(claim > concurCheck && payment > claim);
  assert.match(source, /Identificação de evento Asaas divergente." \}, \{ status: 409 \}/);
  assert.match(source, /\.is\("processed_at", null\)/);
  assert.match(source, /processing_token\.is\.null,processing_at\.lt/);
});

test("não sobrescrever payload, tipo ou erro original ao receber evento ainda não processado", () => {
  const source = readFileSync(new URL("../src/app/api/integrations/asaas/webhook/route.ts", import.meta.url), "utf8");
  const section = source.slice(
    source.indexOf("const { data: previous, error: previousError }"),
    source.indexOf("// Claim atômico por evento"),
  );
  assert.match(section, /\.insert\(\{\s*id: eventId,\s*provider: "asaas",\s*event_type: eventType,\s*provider_charge_id: providerChargeId,\s*payload/);
  assert.doesNotMatch(section, /\.update\(/);
  assert.doesNotMatch(section, /error_message:\s*null/);
  assert.match(section, /insertError\?\.code === "23505"/);
});

test("confirmação continua via RPC idempotente; estornos, notificações e pagamentos tardios preservados", () => {
  const source = readFileSync(new URL("../src/app/api/integrations/asaas/webhook/route.ts", import.meta.url), "utf8");
  assert.match(source, /getPaymentChargeService\(admin\)\.confirmPixCharge/);
  assert.match(source, /needsManualAsaasPaymentReconciliation/);
  assert.match(source, /buildAsaasRefundAttention/);
  assert.match(source, /billing_notification_dispatches/);
  assert.match(source, /\.eq\("id", eventId\)\.eq\("processing_token", processingToken\)/);
});
