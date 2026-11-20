import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAsaasLatePaymentAttention,
  needsManualAsaasPaymentReconciliation,
} from "../src/lib/financeiro/asaasLatePaymentAttention";

const CHARGE = "08c5f55a-8b85-47b4-842d-911772dcd012";
const RECEIVABLE = "c2fda66a-ff99-44fd-8d73-bdf849c251a5";

test("pagamento pendente segue RPC, já pago segue sua idempotência original", () => {
  assert.equal(needsManualAsaasPaymentReconciliation("pending"), false);
  assert.equal(needsManualAsaasPaymentReconciliation("paid"), false);
});

test("pagamento para cobrança encerrada ou estado inesperado exige revisão humana", () => {
  for (const status of ["cancelled", "expired", "failed", "outro"]) {
    assert.equal(needsManualAsaasPaymentReconciliation(status), true, status);
  }
});

test("alerta usa tabela existente, aponta para título e não expõe dados financeiros sensíveis", () => {
  const alert = buildAsaasLatePaymentAttention(CHARGE, RECEIVABLE);
  assert.equal(alert.kind, "system");
  assert.match(alert.title, /Pagamento Asaas.*conciliar/);
  assert.match(alert.message, /recibos e os créditos/);
  assert.match(alert.message, /Nenhum valor foi ajustado automaticamente/);
  assert.equal(alert.entityId, RECEIVABLE);
  assert.equal(alert.href, `/sistema/financeiro/contas-a-receber/${RECEIVABLE}`);
  assert.doesNotMatch(alert.message, /CPF|CNPJ|R\$|e-mail|token/i);
});

test("eventos diferentes da mesma cobrança não disparam vários avisos", () => {
  const first = buildAsaasLatePaymentAttention(CHARGE, RECEIVABLE);
  const replay = buildAsaasLatePaymentAttention(CHARGE, RECEIVABLE);
  const otherCharge = buildAsaasLatePaymentAttention("new-charge", RECEIVABLE);
  assert.deepEqual(first, replay);
  assert.equal(first.eventKey, `asaas:charge:${CHARGE}:late_payment_reconciliation`);
  assert.notEqual(first.eventKey, otherCharge.eventKey);
});

test("webhook não tenta baixa de cobrança encerrada e registra primeiro o alerta", () => {
  const source = readFileSync(new URL("../src/app/api/integrations/asaas/webhook/route.ts", import.meta.url), "utf8");
  const entry = source.indexOf('if (eventType === "PAYMENT_RECEIVED")');
  const guard = source.indexOf("if (needsManualAsaasPaymentReconciliation(charge.status as string))", entry);
  const confirm = source.indexOf("await getPaymentChargeService(admin).confirmPixCharge(", entry);
  const retry = source.indexOf("} catch (confirmationError) {", entry);
  const latest = source.indexOf('.from("payment_charges")\n          .select("status")', retry);
  const alert = source.indexOf("await createPanelNotification(buildAsaasLatePaymentAttention", 0);
  const marked = source.indexOf("await markEvent(input.eventId, input.processingToken", alert);
  assert.ok(entry > 0 && guard > entry && confirm > guard);
  assert.ok(retry > confirm && latest > retry);
  assert.ok(alert > 0 && marked > alert);
  assert.match(source, /return NextResponse\.json\(\{ ok: true, manualReconciliation: true \}\)/);
  assert.match(source, /onConflict: "event_key", ignoreDuplicates: true/);
  assert.match(source, /\.eq\("processing_token", processingToken\)/);
});

test("evento PAYMENT_RECEIVED em processamento normal continua delegando ao banco a confirmação atômica", () => {
  const source = readFileSync(new URL("../src/app/api/integrations/asaas/webhook/route.ts", import.meta.url), "utf8");
  const section = source.slice(source.indexOf('if (eventType === "PAYMENT_RECEIVED")'), source.indexOf('} else if (eventType === "PAYMENT_OVERDUE")'));
  assert.match(section, /confirmPixCharge\(/);
  assert.match(section, /await notifyPaymentReceived\(/);
  assert.doesNotMatch(section, /\.insert\(\{.*receipt_id/s);
});
