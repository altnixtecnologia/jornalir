import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DpsBuildInput } from "@ir/types";
import { isTransmissionEnvironmentAllowed } from "@ir/types";
import { validateDpsAgainstOfficialXsd } from "../src/nfse/xsd-validator";
import { buildDpsXml, formatDhEmi } from "../src/nfse/dps-builder";
import { assertNfseOperationAllowed } from "../src/nfse/environment";

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

test("dhEmi preserva o instante UTC na conversão para São João do Sul (UTC-03)", () => {
  const utc = new Date("2026-10-25T01:15:32.000Z");
  const issued = formatDhEmi(utc);
  assert.equal(issued, "2026-10-24T22:15:32-03:00");
  assert.equal(new Date(issued).toISOString(), utc.toISOString());
});

test("dhEmi também converte corretamente a hora durante o dia", () => {
  const utc = new Date("2026-10-25T17:30:05.000Z");
  assert.equal(formatDhEmi(utc), "2026-10-25T14:30:05-03:00");
});

test("dhEmi rejeita uma data inválida", () => {
  assert.throws(() => formatDhEmi(new Date(Number.NaN)), /Data de emissão inválida/);
});

// Revisão final de encerramento (26/10/2026), item 1 — "confirme que os esquemas fiscais
// estão separados por ambiente e que a versão de Produção Restrita de 20/10/2026 não será
// utilizada indevidamente em produção antes de sua vigência". Ver limitação deliberada
// documentada no topo de xsd-validator.ts.
test("só existe um pacote XSD vendorizado ATIVO (prodrest-v1.01-20261020, Produção Restrita) — nenhum pacote de Produção real foi inventado/vendorizado sem fonte oficial", () => {
  const xsdRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "nfse", "xsd");
  const packages = readdirSync(xsdRoot);
  // "prodrest" = Produção Restrita, em TODOS os pacotes vendorizados (histórico incluso) — nunca um "prod"/"producao" sem o "rest".
  for (const packageName of packages) {
    assert.match(packageName, /^prodrest-/, `pacote XSD "${packageName}" não é de Produção Restrita — precisa de confirmação oficial antes de existir aqui`);
  }
});

test("a transmissão real em Produção continua bloqueada em TODAS as guardas centrais — é isso que torna irrelevante não ter um pacote XSD de Produção real vendorizado ainda", () => {
  assert.equal(isTransmissionEnvironmentAllowed("production"), false);
  assert.throws(() => assertNfseOperationAllowed("production"), /bloqueadas/);
});
