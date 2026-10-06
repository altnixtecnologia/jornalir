import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import forge from "node-forge";
import { parsePfx, PfxCnpjNotFoundError, PfxWrongPasswordError, PfxNoPrivateKeyError } from "../src/nfse/pfx-parser";
import { encryptSecret, decryptSecret, SecretDecryptionError } from "../src/nfse/secret-store";
import { CertificateService, CertificateCnpjMismatchError, CertificateExpiredError } from "../src/nfse/certificate-service";
import type { CertificateRepository, NewCertificateRecord, StoredCertificateRecord } from "../src/nfse/certificate-repository";

before(() => {
  // Chave mestra de TESTE — nunca a chave real de produção (item 10).
  process.env.NFSE_CERTIFICATE_MASTER_KEY = randomBytes(32).toString("base64");
});

const ICP_BRASIL_CNPJ_OID = "2.16.76.1.3.3";

/**
 * Monta a extensão SAN com um `otherName` (OID 2.16.76.1.3.3 — ICP-Brasil/
 * ITI) contendo o CNPJ, no formato EXATO que um e-CNPJ real usa:
 * OtherName ::= SEQUENCE { type-id OID, value [0] EXPLICIT UTF8String }.
 * node-forge não monta isso pelo helper genérico de SAN (ele sempre
 * serializa GeneralName como PRIMITIVE, mas otherName é CONSTRUCTED) —
 * por isso construímos o ASN.1 à mão aqui, só para o fixture de teste.
 */
function buildCnpjSanExtension(cnpj: string) {
  const otherNameValue = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.UTF8, false, cnpj);
  const explicitWrapper = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [otherNameValue]);
  const oidNode = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer(ICP_BRASIL_CNPJ_OID).getBytes());
  const otherNameSeq = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [oidNode, explicitWrapper]);
  const sanSeq = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [otherNameSeq]);
  return {
    name: "subjectAltName",
    id: forge.pki.oids.subjectAltName,
    critical: false,
    value: forge.asn1.toDer(sanSeq).getBytes(),
  };
}

/** PFX de TESTE gerado localmente (node-forge) — nunca um certificado real. */
function makeTestPfx(options: { cnpj?: string; expired?: boolean; omitSan?: boolean } = {}): { pfxBuffer: Buffer; password: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = options.expired ? new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) : new Date();
  cert.validity.notAfter = options.expired ? new Date(Date.now() - 24 * 60 * 60 * 1000) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: "commonName", value: "INFORMATIVO REGIONAL LTDA" }];
  cert.setSubject(attrs);
  cert.setIssuer([{ name: "commonName", value: "AC TESTE" }]);
  if (!options.omitSan) {
    cert.setExtensions([buildCnpjSanExtension(options.cnpj ?? "23970969000190")]);
  }
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const password = "senha-teste-123";
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des" });
  const pfxBuffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), "binary");
  return { pfxBuffer, password };
}

test("parsePfx extrai chave privada/certificado de um PFX válido, lendo o CNPJ do SAN/otherName (OID 2.16.76.1.3.3) — nunca do CN", () => {
  const { pfxBuffer, password } = makeTestPfx({ cnpj: "23970969000190" });
  const parsed = parsePfx(pfxBuffer, password);
  assert.ok(parsed.privateKeyPem.includes("BEGIN RSA PRIVATE KEY") || parsed.privateKeyPem.includes("BEGIN PRIVATE KEY"));
  assert.ok(parsed.certificatePem.includes("BEGIN CERTIFICATE"));
  assert.equal(parsed.subjectCnpj, "23970969000190");
  // CN continua disponível só pra exibição (nunca pra validar CNPJ).
  assert.equal(parsed.subjectName, "INFORMATIVO REGIONAL LTDA");
});

test("parsePfx rejeita explicitamente quando o SAN/otherName OID 2.16.76.1.3.3 não existe — nunca infere CNPJ do CN", () => {
  const { pfxBuffer, password } = makeTestPfx({ omitSan: true });
  assert.throws(() => parsePfx(pfxBuffer, password), PfxCnpjNotFoundError);
});

test("parsePfx rejeita senha incorreta", () => {
  const { pfxBuffer } = makeTestPfx();
  assert.throws(() => parsePfx(pfxBuffer, "senha-errada"), PfxWrongPasswordError);
});

test("parsePfx rejeita arquivo que não é um PFX/P12 válido", () => {
  assert.throws(() => parsePfx(Buffer.from("isto nao e um pfx"), "qualquer"));
});

test("parsePfx rejeita PKCS#12 sem chave privada (só certificado)", () => {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  cert.setSubject([{ name: "commonName", value: "SEM CHAVE" }]);
  cert.setIssuer([{ name: "commonName", value: "AC TESTE" }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const password = "senha-teste-123";
  // key=null -> toPkcs12Asn1 nunca inclui um keyBag/pkcs8ShroudedKeyBag (ver node_modules/node-forge/lib/pkcs12.js).
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(null, cert, password, { algorithm: "3des" });
  const pfxBuffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), "binary");

  assert.throws(() => parsePfx(pfxBuffer, password), PfxNoPrivateKeyError);
});

test("CertificateService.validateAndStore rejeita certificado vencido", async () => {
  const { pfxBuffer, password } = makeTestPfx({ cnpj: "23970969000190", expired: true });
  const service = new CertificateService(makeFakeRepository());
  await assert.rejects(
    () => service.validateAndStore({ issuerConfigId: "issuer-1", expectedCnpjDigits: "23970969000190", pfxBuffer, password }),
    CertificateExpiredError,
  );
});

test("CertificateService.validateAndStore rejeita CNPJ do certificado diferente do prestador", async () => {
  const { pfxBuffer, password } = makeTestPfx({ cnpj: "11111111000199" });
  const service = new CertificateService(makeFakeRepository());
  await assert.rejects(
    () => service.validateAndStore({ issuerConfigId: "issuer-1", expectedCnpjDigits: "23970969000190", pfxBuffer, password }),
    CertificateCnpjMismatchError,
  );
});

test("CertificateService.validateAndStore guarda a chave privada SEMPRE criptografada — nunca em texto", async () => {
  const { pfxBuffer, password } = makeTestPfx({ cnpj: "23970969000190" });
  const repo = makeFakeRepository();
  const service = new CertificateService(repo);
  const info = await service.validateAndStore({ issuerConfigId: "issuer-1", expectedCnpjDigits: "23970969000190", pfxBuffer, password });
  assert.equal(info.subjectCnpj, "23970969000190");
  const stored = repo.created[0];
  assert.ok(!stored.encryptedPrivateKey.ciphertextBase64.includes("PRIVATE KEY"));

  const material = await service.getActiveSigningMaterial("issuer-1");
  assert.ok(material?.privateKeyPem.includes("PRIVATE KEY"));
});

test("CertificateService.validateAndStore desativa certificado anterior ao substituir (nunca dois ativos)", async () => {
  const { pfxBuffer, password } = makeTestPfx({ cnpj: "23970969000190" });
  const repo = makeFakeRepository();
  const service = new CertificateService(repo);
  await service.validateAndStore({ issuerConfigId: "issuer-1", expectedCnpjDigits: "23970969000190", pfxBuffer, password });
  await service.validateAndStore({ issuerConfigId: "issuer-1", expectedCnpjDigits: "23970969000190", pfxBuffer, password });
  assert.equal(repo.deactivateAllCalls, 2);
  assert.equal(repo.created.length, 2);
});

test("secret-store: encrypt/decrypt redonda-viagem preserva o conteúdo", () => {
  const secret = encryptSecret("conteudo-sensivel-de-teste");
  assert.equal(decryptSecret(secret), "conteudo-sensivel-de-teste");
});

test("secret-store: adulteração do ciphertext falha por autenticação (GCM), nunca retorna texto corrompido", () => {
  const secret = encryptSecret("conteudo-sensivel-de-teste");
  const tampered = { ...secret, ciphertextBase64: Buffer.from("adulterado-" + secret.ciphertextBase64, "utf8").toString("base64") };
  assert.throws(() => decryptSecret(tampered), SecretDecryptionError);
});

function makeFakeRepository(): CertificateRepository & { created: StoredCertificateRecord[]; deactivateAllCalls: number } {
  const created: StoredCertificateRecord[] = [];
  let deactivateAllCalls = 0;
  return {
    created,
    get deactivateAllCalls() {
      return deactivateAllCalls;
    },
    async getActive(issuerConfigId: string) {
      return created.filter((record) => record.issuerConfigId === issuerConfigId && record.active).at(-1) ?? null;
    },
    async create(record: NewCertificateRecord) {
      const stored: StoredCertificateRecord = { ...record, id: `cert-${created.length + 1}`, active: true, createdAt: new Date().toISOString() };
      created.push(stored);
      return stored;
    },
    async deactivateAll(issuerConfigId: string) {
      deactivateAllCalls += 1;
      for (const record of created) {
        if (record.issuerConfigId === issuerConfigId) record.active = false;
      }
    },
  };
}
