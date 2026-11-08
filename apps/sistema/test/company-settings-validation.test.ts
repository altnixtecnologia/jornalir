import test from "node:test";
import assert from "node:assert/strict";
import {
  representativePowersValidOn,
  validateCompanyProfile,
  validateLegalRepresentative,
  type CompanyProfileInput,
  type LegalRepresentativeInput,
} from "../src/lib/contracts/companySettingsValidation";
import { inspectTemplatePdf, MAX_TEMPLATE_DOCUMENT_BYTES } from "../src/lib/contracts/templateDocument";

const COMPANY: CompanyProfileInput = {
  legalName: "Jornal Informativo Regional Ltda",
  cnpj: "11.222.333/0001-81",
  addressStreet: "Rua das Flores",
  addressNumber: "100",
  addressCity: "Cidade",
  addressState: "rs",
  addressZip: "97.000-000",
  email: "contato@exemplo.com.br",
};

const REP: LegalRepresentativeInput = {
  fullName: "Fulano de Tal",
  cpf: "529.982.247-25",
  roleTitle: "Sócio-administrador",
  representationRule: "individual",
  powersDescription: "Poderes para assinar contratos conforme cláusula 8ª do contrato social.",
  isDefault: true,
};

test("empresa: normaliza CNPJ/CEP/UF e aceita dados válidos", () => {
  const result = validateCompanyProfile(COMPANY);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.cnpj, "11222333000181");
    assert.equal(result.value.addressZip, "97000000");
    assert.equal(result.value.addressState, "RS");
  }
});

test("empresa: CNPJ inválido, UF inválida, CEP curto, e-mail inválido e razão social curta são recusados com o campo", () => {
  const result = validateCompanyProfile({ ...COMPANY, legalName: "ab", cnpj: "11222333000100", addressState: "R", addressZip: "123", email: "sem-arroba" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    for (const field of ["legalName", "cnpj", "addressState", "addressZip", "email"]) assert.ok(result.errors[field], `esperava erro em ${field}`);
  }
});

test("representante: CPF válido e poderes descritos são obrigatórios", () => {
  assert.equal(validateLegalRepresentative(REP).ok, true);
  const bad = validateLegalRepresentative({ ...REP, cpf: "111.111.111-11", powersDescription: "curto", roleTitle: "" });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.ok(bad.errors.cpf);
    assert.ok(bad.errors.powersDescription);
    assert.ok(bad.errors.roleTitle);
  }
});

test("representante: regra de representação e vigência dos poderes são validadas", () => {
  assert.equal(validateLegalRepresentative({ ...REP, representationRule: "outra" as "individual" }).ok, false);
  const reversed = validateLegalRepresentative({ ...REP, powersValidFrom: "2026-12-31", powersValidUntil: "2026-01-01" });
  assert.equal(reversed.ok, false);
  assert.equal(validateLegalRepresentative({ ...REP, powersValidFrom: "2026-02-30" }).ok, false);
  assert.equal(validateLegalRepresentative({ ...REP, powersValidFrom: "2026-01-01", powersValidUntil: "2027-01-01" }).ok, true);
});

test("poderes só valem dentro da vigência informada", () => {
  const rep = { powersValidFrom: "2026-01-01", powersValidUntil: "2026-12-31" };
  assert.equal(representativePowersValidOn(rep, "2026-06-01"), true);
  assert.equal(representativePowersValidOn(rep, "2025-12-31"), false);
  assert.equal(representativePowersValidOn(rep, "2027-01-01"), false);
  assert.equal(representativePowersValidOn({}, "2030-01-01"), true);
});

test("PDF de documento fixo: aceita PDF íntegro; recusa vazio, não-PDF, sem %%EOF, protegido por senha e acima de 10 MB", () => {
  const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
  const ok = inspectTemplatePdf(pdf);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.path, `templates/${ok.sha256}.pdf`);
  assert.equal(inspectTemplatePdf(new Uint8Array()).ok, false);
  assert.equal(inspectTemplatePdf(Buffer.from("MZ executável".repeat(20))).ok, false);
  assert.equal(inspectTemplatePdf(Buffer.from("%PDF-1.7\nsem fim")).ok, false);
  assert.equal(inspectTemplatePdf(Buffer.from("%PDF-1.7\n/Encrypt 1 0 R\n%%EOF")).ok, false);
  const huge = Buffer.concat([pdf, Buffer.alloc(MAX_TEMPLATE_DOCUMENT_BYTES)]);
  assert.equal(inspectTemplatePdf(huge).ok, false);
});

test("PDF: mesmo conteúdo => mesmo caminho (idempotente); conteúdo diferente => caminho diferente", () => {
  const a = inspectTemplatePdf(Buffer.from("%PDF-1.7\nA\n%%EOF"));
  const a2 = inspectTemplatePdf(Buffer.from("%PDF-1.7\nA\n%%EOF"));
  const b = inspectTemplatePdf(Buffer.from("%PDF-1.7\nB\n%%EOF"));
  assert.ok(a.ok && a2.ok && b.ok);
  if (a.ok && a2.ok && b.ok) {
    assert.equal(a.path, a2.path);
    assert.notEqual(a.path, b.path);
  }
});
