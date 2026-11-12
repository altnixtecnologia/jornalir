import { test } from "node:test";
import assert from "node:assert/strict";
import type { NfseCertificateInfo, NfseIssuerConfig } from "@ir/types";
import { checkHomologationReadiness } from "../src/nfse/readiness";

// Fixture inteiramente sintetica, sem dados reais de clientes, emitentes ou A1.
const issuer: NfseIssuerConfig = {
  id: "emissor-sintetico",
  companyName: "EMITENTE FICTICIO DE TESTE",
  cnpj: "00000000000000",
  municipalRegistration: "0000",
  municipality: "Municipio de teste",
  state: "SC",
  ibgeCode: "0000000",
  environment: "homologation",
  certificateType: "a1",
  certificateStatus: "configured",
  dpsSeries: "1",
  simplesNacionalOption: "me_epp",
  specialTaxRegimeCode: "none",
  ibsCbsSimplesNacionalRegime: "simples_both",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const certificate: NfseCertificateInfo = {
  id: "a1-sintetico",
  subjectCnpj: issuer.cnpj,
  subjectName: "EMITENTE FICTICIO DE TESTE",
  issuerName: "AUTORIDADE CERTIFICADORA FICTICIA",
  serialNumber: "FAKE-01",
  fingerprint: "FAKE-FINGERPRINT",
  validFrom: "2020-01-01T00:00:00Z",
  validUntil: "2035-01-01T00:00:00Z",
  active: true,
  createdAt: "2026-01-01T00:00:00Z",
};

function diagnose(patch: Partial<NfseCertificateInfo>) {
  return checkHomologationReadiness({
    issuerConfig: issuer,
    activeCertificate: { ...certificate, ...patch },
    cTribNacConfigured: true,
    lastXsdValidationValid: true,
  });
}

test("A1 valido, ativo e dentro do prazo nao adiciona bloqueios de certificado", () => {
  const result = diagnose({});
  assert.equal(result.missing.filter((message) => /certificado/i.test(message)).length, 0);
});

test("A1 desativado nunca permite prontidao fiscal", () => {
  const result = diagnose({ active: false });
  assert.equal(result.ready, false);
  assert.ok(result.missing.some((message) => /desativado/i.test(message)));
});

test("A1 ainda nao valido bloqueia prontidao fiscal", () => {
  const result = diagnose({ validFrom: "2030-01-01T00:00:00Z" });
  assert.equal(result.ready, false);
  assert.ok(result.missing.some((message) => /ainda nao|ainda não/i.test(message)));
});

test("A1 vencido bloqueia prontidao fiscal", () => {
  const result = diagnose({ validUntil: "2021-01-01T00:00:00Z" });
  assert.equal(result.ready, false);
  assert.ok(result.missing.some((message) => /vencido/i.test(message)));
});

test("datas invalidas, incluindo NaN e intervalo invertido, bloqueiam prontidao", () => {
  for (const patch of [
    { validUntil: "data-invalida" },
    { validFrom: "data-invalida" },
    { validFrom: "2036-01-01T00:00:00Z", validUntil: "2035-01-01T00:00:00Z" },
  ]) {
    const result = diagnose(patch);
    assert.equal(result.ready, false);
    assert.ok(result.missing.some((message) => /datas de validade/i.test(message)));
  }
});

test("A1 sem CNPJ confiavel ou com CNPJ divergente nao fica pronto", () => {
  for (const subjectCnpj of [undefined, "", "123", "11111111000111"]) {
    const result = diagnose({ subjectCnpj });
    assert.equal(result.ready, false);
    assert.ok(result.missing.some((message) => /cnpj do certificado/i.test(message)));
  }
});
