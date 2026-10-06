import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNfseDraft } from "../src/nfse/draft-service";
import { isValidCnpj, isValidCpf } from "../src/clientes/client-validation";

const COMPLETE_INPUT = {
  clientId: "client-1",
  tomadorKind: "individual" as const,
  tomadorName: "Maria Souza",
  tomadorCpf: "11144477735",
  tomadorCnpj: undefined,
  tomadorCity: "São João do Sul",
  tomadorState: "SC",
  serviceProfileId: "profile-1",
  cTribNac: "010101",
  competencyDate: "2026-10-01",
  serviceValue: 150,
  serviceDescription: "Veiculação de anúncio",
  issuerConfigured: true,
};

// NFS-e, Parte 1 — validação INTERNA de pré-emissão (nunca declara o
// rascunho "fiscalmente válido perante a Receita/Governo", item 10).

test("validação interna: rascunho completo é considerado pronto para futura transmissão", () => {
  const result = validateNfseDraft(COMPLETE_INPUT);
  assert.equal(result.readyForFutureTransmission, true);
  assert.deepEqual(result.missingFields, []);
});

test("validação interna: rascunho incompleto reporta exatamente os campos faltantes", () => {
  const result = validateNfseDraft({
    ...COMPLETE_INPUT,
    serviceDescription: "",
    cTribNac: "",
  });
  assert.equal(result.readyForFutureTransmission, false);
  assert.ok(result.missingFields.includes("Descrição do serviço"));
  assert.ok(result.missingFields.includes("Código de tributação nacional (cTribNac)"));
});

test("validação interna: valor zero é rejeitado", () => {
  const result = validateNfseDraft({ ...COMPLETE_INPUT, serviceValue: 0 });
  assert.equal(result.readyForFutureTransmission, false);
  assert.ok(result.missingFields.some((field) => field.includes("Valor do serviço")));
});

test("validação interna: valor negativo é rejeitado", () => {
  const result = validateNfseDraft({ ...COMPLETE_INPUT, serviceValue: -50 });
  assert.equal(result.readyForFutureTransmission, false);
  assert.ok(result.missingFields.some((field) => field.includes("Valor do serviço")));
});

test("validação interna: CPF inválido é rejeitado mesmo com todo o resto completo", () => {
  const result = validateNfseDraft({ ...COMPLETE_INPUT, tomadorCpf: "12345678900" });
  assert.equal(result.readyForFutureTransmission, false);
  assert.ok(result.missingFields.includes("CPF do tomador válido"));
});

test("validação interna: tomador pessoa jurídica exige CNPJ válido, não CPF", () => {
  const result = validateNfseDraft({
    ...COMPLETE_INPUT,
    tomadorKind: "company",
    tomadorCpf: undefined,
    tomadorCnpj: "11222333000181",
  });
  assert.equal(result.readyForFutureTransmission, true);
});

test("validação interna: configuração do prestador ausente bloqueia o rascunho", () => {
  const result = validateNfseDraft({ ...COMPLETE_INPUT, issuerConfigured: false });
  assert.equal(result.readyForFutureTransmission, false);
  assert.ok(result.missingFields.includes("Configuração fiscal do prestador"));
});

test("reaproveita os utilitários já existentes de CPF/CNPJ (não reimplementa validação)", () => {
  assert.equal(isValidCpf("11144477735"), true);
  assert.equal(isValidCpf("11111111111"), false);
  assert.equal(isValidCnpj("11222333000181"), true);
  assert.equal(isValidCnpj("00000000000000"), false);
});
