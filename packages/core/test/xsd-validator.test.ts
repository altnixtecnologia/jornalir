import { test } from "node:test";
import assert from "node:assert/strict";
import type { DpsBuildInput } from "@ir/types";
import { validateDpsAgainstOfficialXsd } from "../src/nfse/xsd-validator";
import { buildDpsXml } from "../src/nfse/dps-builder";

/**
 * DPS completa do cenário operacional inicial do Jornal IR (Parte 2C,
 * item 1): prestador PJ brasileiro optante do Simples Nacional,
 * tomador PF, serviço comum prestado no Brasil, sem retenções
 * especiais/IBS-CBS. Fixture ÚNICA de referência — reaproveitada entre
 * os testes "válido"/"assinado" pra nunca divergir.
 */
function makeScenarioInput(overrides: Partial<DpsBuildInput> = {}): DpsBuildInput {
  return {
    issuer: {
      companyName: "INFORMATIVO REGIONAL LTDA",
      cnpj: "23970969000190",
      municipalRegistration: "1000546",
      ibgeCode: "4216404",
      municipality: "São João do Sul",
      state: "SC",
      simplesNacionalOption: "me_epp",
      specialTaxRegimeCode: "none",
    },
    tomador: { sourceClientId: "client-1", kind: "individual", name: "Maria Souza", cpf: "11144477735", city: "São João do Sul", state: "SC" },
    fiscal: { cTribNac: "140619" },
    competencyDate: "2026-10-01",
    serviceValue: 150.5,
    serviceDescription: "Veiculação de anúncio publicitário",
    environment: "homologation",
    dpsSeries: "1",
    dpsNumber: 42,
    ...overrides,
  };
}

test("fixture completa do cenário inicial (buildDpsXml) PASSA de verdade na validação XSD oficial — sem bypass/mock/skip", async () => {
  const xml = buildDpsXml(makeScenarioInput());
  const result = await validateDpsAgainstOfficialXsd(xml);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("fixture com tomador pessoa jurídica também passa na validação XSD oficial", async () => {
  const xml = buildDpsXml(
    makeScenarioInput({ tomador: { sourceClientId: "client-2", kind: "company", name: "Cliente PJ Ltda", cnpj: "11111111000199", city: "São João do Sul", state: "SC" } }),
  );
  const result = await validateDpsAgainstOfficialXsd(xml);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("XSD inválido rejeita — nunca finge sucesso", async () => {
  const result = await validateDpsAgainstOfficialXsd("<DPS><infDPS></infDPS></DPS>");
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("sem Simples Nacional configurado no prestador, buildDpsXml omite regTrib e a validação XSD real REJEITA (grupo obrigatório ausente)", async () => {
  const xml = buildDpsXml(makeScenarioInput({ issuer: { ...makeScenarioInput().issuer, simplesNacionalOption: undefined, specialTaxRegimeCode: undefined } }));
  const result = await validateDpsAgainstOfficialXsd(xml);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("regTrib") || error.includes("prest")));
});
