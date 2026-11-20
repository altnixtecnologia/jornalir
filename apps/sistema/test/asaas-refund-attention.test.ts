import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAsaasRefundAttention } from "../src/lib/financeiro/asaasRefundAttention";

const RECEIVABLE_ID = "f5103a66-0e7d-49de-b78b-3b770bda9155";

test("estorno total cria alerta de conciliação, sem expor dados sensíveis", () => {
  const alert = buildAsaasRefundAttention("PAYMENT_REFUNDED", "evt_1001", RECEIVABLE_ID);
  assert.equal(alert.kind, "system");
  assert.match(alert.title, /Estorno no Asaas/);
  assert.match(alert.message, /recibos e créditos/);
  assert.equal(alert.href, `/sistema/financeiro/contas-a-receber/${RECEIVABLE_ID}`);
  assert.equal(alert.entityId, RECEIVABLE_ID);
  assert.equal(alert.eventKey, "asaas:evt_1001:refund_reconciliation");
  assert.doesNotMatch(alert.message, /R\$|CPF|CNPJ|telefone|cartão/i);
});

test("estorno parcial recebe orientação específica sem realizar abatimento automático", () => {
  const alert = buildAsaasRefundAttention("PAYMENT_PARTIALLY_REFUNDED", "evt_1002", RECEIVABLE_ID);
  assert.match(alert.title, /Estorno parcial/);
  assert.match(alert.message, /Confira os valores/);
  assert.match(alert.message, /ajuste manual/);
});

test("o mesmo evento produz a mesma chave; estornos parciais distintos não se suprimem", () => {
  const first = buildAsaasRefundAttention("PAYMENT_PARTIALLY_REFUNDED", "evt_1003", RECEIVABLE_ID);
  const replay = buildAsaasRefundAttention("PAYMENT_PARTIALLY_REFUNDED", "evt_1003", RECEIVABLE_ID);
  const other = buildAsaasRefundAttention("PAYMENT_PARTIALLY_REFUNDED", "evt_1004", RECEIVABLE_ID);
  assert.deepEqual(first, replay);
  assert.notEqual(first.eventKey, other.eventKey);
});

test("webhook real cria notificação antes de confirmar evento e preserva estorno manual", () => {
  const src = readFileSync(new URL("../src/app/api/integrations/asaas/webhook/route.ts", import.meta.url), "utf8");
  const start = src.indexOf('} else if (eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_PARTIALLY_REFUNDED")');
  const end = src.indexOf("\n    }", start + 10);
  assert.ok(start > 0 && end > start, "Ramo de estorno precisa existir");
  const block = src.slice(start, end);
  const alertIndex = block.indexOf("await createPanelNotification(attention)");
  const processedIndex = block.indexOf("await markEvent(eventId, processingToken");
  assert.ok(alertIndex > 0 && processedIndex > alertIndex, "Primeiro alerta idempotente, depois confirmação do webhook");
  assert.match(block, /manualReconciliation: true/);
  assert.doesNotMatch(block, /confirmPixCharge|cancelCharge|\.update\(|\.delete\(|\.insert\(|\.rpc\(/);
  assert.match(src, /onConflict: "event_key", ignoreDuplicates: true/);
  assert.match(src, /kind: "payment_received".*\| "system"/);
});

test("rota reconhece cobrança do próprio Jornal antes de gerar aviso de estorno", () => {
  const src = readFileSync(new URL("../src/app/api/integrations/asaas/webhook/route.ts", import.meta.url), "utf8");
  const lookup = src.indexOf('.eq("provider_charge_id", providerChargeId)');
  const ownCharge = src.indexOf('if (!charge) {');
  const refund = src.indexOf('} else if (eventType === "PAYMENT_REFUNDED"');
  assert.ok(lookup > 0 && ownCharge > lookup && refund > ownCharge);
  assert.match(src, /constantTimeEquals\(receivedToken, expectedToken\)/);
  assert.match(src, /claim atômico/i);
});
