import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftService, isValidNfseCompetencyDate, isValidNfseServiceValue, parseNfseServiceValue, validateNfseDraft } from "../src/nfse/draft-service";
import type { DraftInput } from "../src/nfse/draft-service";
import type { DraftRepository } from "../src/nfse/draft-repository";
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

test("entrada monetária brasileira: reais e centavos sem ambiguidade", () => {
  assert.equal(parseNfseServiceValue("150,00"), 150);
  assert.equal(parseNfseServiceValue("150.00"), 150);
  assert.equal(parseNfseServiceValue("1.234,56"), 1234.56);
  assert.equal(parseNfseServiceValue("1234.56"), 1234.56);
  assert.equal(parseNfseServiceValue("0,01"), 0.01);
  for (const invalid of ["1.234", "1.234.56", "100,001", "1e3", "R$ 10", "", "0,00", "0,001"]) {
    assert.equal(Number.isNaN(parseNfseServiceValue(invalid)), true, `Entrada inválida aceita: ${invalid}`);
  }
});

test("valor fiscal não pode ser arredondado silenciosamente", () => {
  for (const valid of [0.01, 150.1, 150.99, 1234.56]) {
    assert.equal(isValidNfseServiceValue(valid), true, `Rejeitou valor válido ${valid}`);
  }
  for (const invalid of [0.001, 1.005, 12.345, 0, -1, Number.NaN, Infinity, 1e20]) {
    assert.equal(isValidNfseServiceValue(invalid), false, `Aceitou valor inválido ${invalid}`);
    assert.equal(validateNfseDraft({ ...COMPLETE_INPUT, serviceValue: invalid }).readyForFutureTransmission, false);
  }
});

test("competência valida dia real do calendário e ano bissexto", () => {
  for (const valid of ["2024-02-29", "2000-02-29", "2026-11-12"]) {
    assert.equal(isValidNfseCompetencyDate(valid), true);
  }
  for (const invalid of ["2026-02-29", "2100-02-29", "2026-11-31", "2026-00-10", "2026-13-01", "0000-01-01", "2026-1-5", "2030-01-00", "qualquer", ""]) {
    assert.equal(isValidNfseCompetencyDate(invalid), false, `Aceitou data inválida ${invalid}`);
    assert.equal(validateNfseDraft({ ...COMPLETE_INPUT, competencyDate: invalid }).readyForFutureTransmission, false);
  }
});

test("DraftService bloqueia moeda inválida e datas impossíveis antes de gravar", () => {
  let inserts = 0;
  const repository = {
    create: async () => { inserts++; throw new Error("A gravação não deveria ser chamada"); },
  } as unknown as DraftRepository;
  const service = new DraftService(repository);
  const valid: DraftInput = {
    clientId: "cliente-sintetico",
    tomador: { sourceClientId: "cliente-sintetico", kind: "individual", name: "Pessoa Teste" },
    fiscal: {},
    competencyDate: "2026-11-12",
    serviceValue: 100,
    serviceDescription: "Serviço hipotético para teste",
  };
  assert.throws(() => service.register({ ...valid, serviceValue: 0.001 }), /centavos|duas casas/);
  assert.throws(() => service.register({ ...valid, competencyDate: "2026-02-30" }), /competência válida/);
  assert.equal(inserts, 0);
});
