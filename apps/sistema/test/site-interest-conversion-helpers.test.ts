import test from "node:test";
import assert from "node:assert/strict";
import {
  onlyDigits,
  todayInBrazil,
  addDaysIso,
  addYearsIso,
  advertisingSelections,
  subscriptionSelectionAmount,
  commercialConditionFromPayment,
} from "../src/app/sistema/publicidade/solicitacoes/siteInterestConversionHelpers";

test("onlyDigits remove tudo que não for dígito, inclusive string vazia/nula", () => {
  assert.equal(onlyDigits("(48) 99999-0000"), "48999990000");
  assert.equal(onlyDigits(null), "");
  assert.equal(onlyDigits(undefined), "");
});

test("todayInBrazil usa o fuso America/Sao_Paulo, não UTC nem o fuso local do processo", () => {
  // 2026-01-01T02:30:00Z é 2025-12-31 23:30 em São Paulo (UTC-3) — dia civil diferente do UTC.
  const result = todayInBrazil(new Date("2026-01-01T02:30:00Z"));
  assert.equal(result, "2025-12-31");
});

test("addDaysIso/addYearsIso preservam o dia civil, sem deslocar por fuso (hora fixa em 12:00Z)", () => {
  assert.equal(addDaysIso("2026-10-31", 3), "2026-11-03");
  assert.equal(addYearsIso("2026-10-31", 1), "2027-10-31");
});

test("advertisingSelections extrai só os itens print_ad/digital_ad, nunca inventa preço nem inclui item de assinatura", () => {
  const items = advertisingSelections([
    { type: "print_ad", id: "a1", label: "Meia página", finalPrice: 500 },
    { type: "digital_ad", id: "a2", label: "Banner site", individualPrice: 300 },
    { type: "subscription", id: "annual-newspaper", finalPrice: 180 },
    { type: "print_ad", id: "a3" }, // sem label nem preço — nunca inventa, cai no fallback do id e preço 0
    "nao-e-objeto",
    null,
  ]);
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], { id: "a1", label: "Meia página", price: 500, type: "print_ad" });
  assert.deepEqual(items[1], { id: "a2", label: "Banner site", price: 300, type: "digital_ad" });
  assert.deepEqual(items[2], { id: "a3", label: "a3", price: 0, type: "print_ad" });
});

test("advertisingSelections prioriza finalPrice sobre individualPrice e price, nessa ordem", () => {
  const [item] = advertisingSelections([
    { type: "print_ad", id: "a1", label: "Anúncio", finalPrice: 100, individualPrice: 200, price: 300 },
  ]);
  assert.equal(item.price, 100);
});

test("advertisingSelections retorna lista vazia quando selections não é array", () => {
  assert.deepEqual(advertisingSelections(null), []);
  assert.deepEqual(advertisingSelections(undefined), []);
  assert.deepEqual(advertisingSelections({ not: "an array" }), []);
});

test("subscriptionSelectionAmount só reconhece o item de assinatura, nunca confunde com publicidade", () => {
  assert.equal(
    subscriptionSelectionAmount([
      { type: "print_ad", id: "a1", finalPrice: 500 },
      { type: "subscription", id: "annual-newspaper", finalPrice: 180 },
    ]),
    180,
  );
  assert.equal(subscriptionSelectionAmount([{ type: "print_ad", id: "a1", finalPrice: 500 }]), null);
  assert.equal(subscriptionSelectionAmount(null), null);
});

test("commercialConditionFromPayment mapeia pix/cash para 'cash', boleto/credit_card para 'installments', e o resto para 'other'", () => {
  assert.equal(commercialConditionFromPayment("pix"), "cash");
  assert.equal(commercialConditionFromPayment("cash"), "cash");
  assert.equal(commercialConditionFromPayment("boleto"), "installments");
  assert.equal(commercialConditionFromPayment("credit_card"), "installments");
  assert.equal(commercialConditionFromPayment("to_define"), "other");
  assert.equal(commercialConditionFromPayment(null), "other");
});
