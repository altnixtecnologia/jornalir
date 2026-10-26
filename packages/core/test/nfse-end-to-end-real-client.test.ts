import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import forge from "node-forge";
import { MockAgent } from "undici";
import type { NfseCertificateInfo, NfseDraft, NfseIssuerConfig, NfseIssuedNote, NfseTransmissionAttempt } from "@ir/types";
import type {
  DraftRepository,
  DpsSequenceRepository,
  IssuerConfigRepository,
  IssuedNoteRepository,
  NewDraftRecord,
  NewIssuedNoteRecord,
  NewTransmissionAttemptRecord,
  TransmissionAttemptRepository,
} from "../src/nfse";
import { SefinNacionalNationalNfseProvider } from "../src/nfse/national-nfse-provider";
import { SefinNacionalClient } from "../src/nfse/sefin-nacional-client";
import {
  AlreadyIssuedError,
  CertificateNotConfiguredError,
  TransmissionService,
  type CertificateMaterialProvider,
} from "../src/nfse/transmission-service";

/**
 * Teste de integração ponta a ponta (etapa de integração final,
 * 25/10/2026, item 4 — "testar com MockAgent: simular o fluxo completo
 * desde o rascunho até a resposta oficial"). Diferença chave em
 * relação a `nfse-transmission.test.ts`: aqui o provider NÃO é um fake
 * simplificado — é `SefinNacionalNationalNfseProvider` (adaptador real)
 * sobre `SefinNacionalClient` real sobre `MockAgent` (sem rede de
 * verdade), exatamente a composição que seria usada se
 * `FetchNationalNfseProvider` fosse substituído em
 * `apps/sistema/src/composition/nfse.ts` — o que esta fase
 * deliberadamente NÃO faz (ver national-nfse-provider.ts).
 */

function makeDraft(overrides: Partial<NfseDraft> = {}): NfseDraft {
  return {
    id: "draft-1",
    reference: "IR-NFSE-2026-000001",
    clientId: "client-1",
    tomador: { sourceClientId: "client-1", kind: "individual", name: "Maria Souza", cpf: "11144477735", city: "São João do Sul", state: "SC" },
    serviceProfileId: "profile-1",
    fiscal: { sourceServiceProfileId: "profile-1", cTribNac: "010101" },
    competencyDate: "2026-10-01",
    serviceValue: 200,
    serviceDescription: "Veiculação de anúncio",
    status: "draft",
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function makeIssuerConfig(overrides: Partial<NfseIssuerConfig> = {}): NfseIssuerConfig {
  return {
    id: "issuer-1",
    companyName: "INFORMATIVO REGIONAL LTDA",
    cnpj: "23970969000190",
    municipalRegistration: "1000546",
    municipality: "São João do Sul",
    state: "SC",
    ibgeCode: "4216404",
    environment: "homologation",
    certificateType: "a1",
    certificateStatus: "configured",
    dpsSeries: "1",
    simplesNacionalOption: "me_epp",
    specialTaxRegimeCode: "none",
    ibsCbsSimplesNacionalRegime: "simples_both",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

class FakeDraftRepository implements DraftRepository {
  constructor(private readonly draft: NfseDraft | null) {}
  async list() { return this.draft ? [this.draft] : []; }
  async getById(id: string) { return this.draft && this.draft.id === id ? this.draft : null; }
  async create(_record: NewDraftRecord): Promise<NfseDraft> { throw new Error("not used in these tests"); }
  async update(): Promise<NfseDraft> { throw new Error("not used in these tests"); }
  async findByOrigin(): Promise<NfseDraft | null> { return null; }
  async claimForTransmission(): Promise<void> {}
  async releaseTransmissionClaim(): Promise<void> {}
}

class FakeIssuerConfigRepository implements IssuerConfigRepository {
  constructor(private readonly config: NfseIssuerConfig | null) {}
  async getCurrent() { return this.config; }
  async create(): Promise<NfseIssuerConfig> { throw new Error("not used in these tests"); }
  async update(): Promise<NfseIssuerConfig> { throw new Error("not used in these tests"); }
}

class FakeDpsSequenceRepository implements DpsSequenceRepository {
  public calls = 0;
  async reserveNext() { this.calls += 1; return this.calls; }
}

class FakeIssuedNoteRepository implements IssuedNoteRepository {
  public created: NewIssuedNoteRecord[] = [];
  private readonly byDraft = new Map<string, NfseIssuedNote>();
  async listAll() { return [...this.byDraft.values()]; }
  async getByDraftId(draftId: string) { return this.byDraft.get(draftId) ?? null; }
  async getById(id: string) { return [...this.byDraft.values()].find((note) => note.id === id) ?? null; }
  async create(record: NewIssuedNoteRecord): Promise<NfseIssuedNote> {
    if (this.byDraft.has(record.draftId)) {
      throw new Error('duplicate key value violates unique constraint "nfse_issued_notes_draft_id_key"');
    }
    this.created.push(record);
    const note: NfseIssuedNote = { id: `note-${this.created.length}`, createdAt: "2026-10-01T10:05:00Z", ...record };
    this.byDraft.set(record.draftId, note);
    return note;
  }
}

class FakeTransmissionAttemptRepository implements TransmissionAttemptRepository {
  public created: NewTransmissionAttemptRecord[] = [];
  async listByDraftId() { return [] as NfseTransmissionAttempt[]; }
  async create(record: NewTransmissionAttemptRecord): Promise<NfseTransmissionAttempt> {
    this.created.push(record);
    return { id: `attempt-${this.created.length}`, createdAt: "2026-10-01T10:05:00Z", ...record };
  }
}

const FAKE_CERTIFICATE_INFO: NfseCertificateInfo = {
  id: "cert-1", subjectCnpj: "23970969000190", subjectName: "TESTE", issuerName: "AC TESTE",
  serialNumber: "01", fingerprint: "AA:BB:CC:DD", validFrom: "2026-01-01T00:00:00Z",
  validUntil: "2030-01-01T00:00:00Z", active: true, createdAt: "2026-01-01T00:00:00Z",
};

function makeTestKeyAndCert(): { privateKeyPem: string; certificatePem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: "commonName", value: "TESTE:23970969000190" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certificatePem: forge.pki.certificateToPem(cert) };
}

function makeConfiguredCertificateProvider(): CertificateMaterialProvider {
  const { privateKeyPem, certificatePem } = makeTestKeyAndCert();
  return {
    async getActiveInfo() { return FAKE_CERTIFICATE_INFO; },
    async getActiveSigningMaterial() { return { privateKeyPem, certificatePem }; },
  };
}

function makeUnconfiguredCertificateProvider(): CertificateMaterialProvider {
  return { async getActiveInfo() { return null; }, async getActiveSigningMaterial() { return null; } };
}

function fakeNfseXml(): string {
  // emit/CNPJ precisa bater com o CNPJ do prestador em makeIssuerConfig() ("23970969000190") —
  // senão a verificação de associação prestador/DPS (sefin-nacional-client.ts, item 3 da
  // auditoria estrutural de 26/10/2026) rejeitaria esta fixture como se fosse de outro CNPJ.
  return (
    '<NFSe versao="1.01"><infNFSe Id="NFS42164041199999999999999999900000000012026100001"><nNFSe>12</nNFSe>' +
    "<dhProc>2026-10-25T12:00:00Z</dhProc><emit><CNPJ>23970969000190</CNPJ></emit></infNFSe></NFSe>"
  );
}

/** Monta um TransmissionService real, com o adaptador real sobre MockAgent no lugar do fake simplificado. */
function makeEndToEndService(opts: {
  mock: MockAgent;
  draft?: NfseDraft | null;
  issuerConfig?: NfseIssuerConfig | null;
  certificateConfigured?: boolean;
}) {
  const drafts = new FakeDraftRepository(opts.draft ?? makeDraft());
  const issuerConfigs = new FakeIssuerConfigRepository(opts.issuerConfig ?? makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  const client = new SefinNacionalClient(opts.mock, 2_000, () => undefined);
  const provider = new SefinNacionalNationalNfseProvider(client);
  const certificate = opts.certificateConfigured === false ? makeUnconfiguredCertificateProvider() : makeConfiguredCertificateProvider();
  const service = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, provider, certificate);
  return { service, issuedNotes, attempts, dpsSequences, provider };
}

test("fluxo completo ponta a ponta: rascunho -> DPS -> assinatura -> SefinNacionalNationalNfseProvider -> MockAgent -> autorizada -> issued note com dados REAIS da resposta", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/nfse", method: "POST" }).reply(200, {
    chaveAcesso: "421640419999999999999999999990000000001202610",
    nfseXmlGZipB64: gzipSync(Buffer.from(fakeNfseXml(), "utf8")).toString("base64"),
  });
  const { service, issuedNotes, attempts } = makeEndToEndService({ mock });

  const result = await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });

  assert.equal(result.outcome, "authorized");
  assert.equal(issuedNotes.created.length, 1);
  assert.equal(issuedNotes.created[0].accessKey, "421640419999999999999999999990000000001202610");
  assert.equal(issuedNotes.created[0].nfseNumber, "12");
  assert.equal(issuedNotes.created[0].nfseXml, fakeNfseXml());
  assert.equal(attempts.created[0].status, "pending");
  assert.equal(attempts.created[1].status, "authorized");
  await mock.close();
});

test("fluxo completo: rejeição real (E999) nunca cria issued note, mesmo vindo do adaptador real", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/nfse", method: "POST" }).reply(400, {
    erros: [{ Codigo: "E999", Descricao: "Erro não catalogado" }],
  });
  const { service, issuedNotes, attempts } = makeEndToEndService({ mock });

  const result = await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });

  assert.equal(result.outcome, "rejected");
  assert.equal(result.rejection?.code, "E999");
  assert.equal(issuedNotes.created.length, 0);
  assert.equal(attempts.created[0].status, "pending");
  assert.equal(attempts.created[1].status, "rejected");
  await mock.close();
});

test("fluxo completo: timeout/falha de rede de verdade (sem resposta do MockAgent) vira 'uncertain' — nunca retransmite, nunca cria issued note", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  // Nenhum intercept registrado para este path -> undici lança MockNotMatchedError, que o
  // SefinNacionalClient normaliza como falha de transporte (ver integration-errors.ts).
  const { service, issuedNotes, attempts } = makeEndToEndService({ mock });

  const result = await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });

  assert.equal(result.outcome, "uncertain");
  assert.equal(issuedNotes.created.length, 0);
  assert.equal(attempts.created[0].status, "pending");
  assert.equal(attempts.created[1].status, "uncertain");
  await mock.close();
});

test("fluxo completo: resposta de autorização sem chaveAcesso (inválida) também vira 'uncertain' — por precaução, nunca tratada como certamente rejeitada/autorizada", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/nfse", method: "POST" }).reply(200, {
    nfseXmlGZipB64: gzipSync(Buffer.from(fakeNfseXml(), "utf8")).toString("base64"),
  });
  const { service, issuedNotes, attempts } = makeEndToEndService({ mock });

  const result = await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });

  assert.equal(result.outcome, "uncertain");
  assert.equal(issuedNotes.created.length, 0);
  assert.equal(attempts.created[0].status, "pending");
  assert.equal(attempts.created[1].status, "uncertain");
  await mock.close();
});

test("fluxo completo: certificado ausente bloqueia ANTES de qualquer chamada ao MockAgent (nenhum intercept configurado, nenhum necessário)", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const { service, dpsSequences, attempts } = makeEndToEndService({ mock, certificateConfigured: false });

  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), CertificateNotConfiguredError);
  assert.equal(dpsSequences.calls, 0);
  assert.equal(attempts.created.length, 0);
  await mock.close();
});

test("fluxo completo: consulta posterior pela chave de acesso via o mesmo adaptador real", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool
    .intercept({ path: "/API/SefinNacional/nfse/421640419999999999999999999990000000001202610", method: "GET" })
    .reply(200, { nfseXmlGZipB64: gzipSync(Buffer.from(fakeNfseXml(), "utf8")).toString("base64") });
  const { service } = makeEndToEndService({ mock });

  const xml = await service.consultNfseByAccessKey("421640419999999999999999999990000000001202610");
  assert.equal(xml, fakeNfseXml());
  await mock.close();
});

test("fluxo completo: mutex real com o adaptador real — duas transmissões concorrentes do mesmo rascunho, só uma autoriza", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/nfse", method: "POST" }).reply(200, {
    chaveAcesso: "421640419999999999999999999990000000001202610",
    nfseXmlGZipB64: gzipSync(Buffer.from(fakeNfseXml(), "utf8")).toString("base64"),
  });

  const drafts = new FakeDraftRepository(makeDraft());
  let claimed = false;
  drafts.claimForTransmission = async () => {
    if (claimed) throw new Error("Este rascunho já está sendo transmitido agora");
    claimed = true;
  };
  drafts.releaseTransmissionClaim = async () => { claimed = false; };
  const issuerConfigs = new FakeIssuerConfigRepository(makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  const provider = new SefinNacionalNationalNfseProvider(client);
  const certificate = makeConfiguredCertificateProvider();
  const service = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, provider, certificate);

  const results = await Promise.allSettled([
    service.transmit({ draftId: "draft-1", isAdminOrOwner: true }),
    service.transmit({ draftId: "draft-1", isAdminOrOwner: true }),
  ]);

  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(issuedNotes.created.length, 1);
  await mock.close();
});

test("fluxo completo: idempotência real (backstop UNIQUE) com o adaptador real, mutex deliberadamente desligado — nunca duas issued notes", async () => {
  const mock = new MockAgent();
  mock.disableNetConnect();
  const pool = mock.get("https://sefin.producaorestrita.nfse.gov.br");
  pool.intercept({ path: "/API/SefinNacional/nfse", method: "POST" }).reply(200, {
    chaveAcesso: "421640419999999999999999999990000000001202610",
    nfseXmlGZipB64: gzipSync(Buffer.from(fakeNfseXml(), "utf8")).toString("base64"),
  }).persist();

  const drafts = new FakeDraftRepository(makeDraft());
  drafts.claimForTransmission = async () => {};
  drafts.releaseTransmissionClaim = async () => {};
  const issuerConfigs = new FakeIssuerConfigRepository(makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  const client = new SefinNacionalClient(mock, 2_000, () => undefined);
  const provider = new SefinNacionalNationalNfseProvider(client);
  const certificate = makeConfiguredCertificateProvider();
  const service = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, provider, certificate);

  const results = await Promise.allSettled([
    service.transmit({ draftId: "draft-1", isAdminOrOwner: true }),
    service.transmit({ draftId: "draft-1", isAdminOrOwner: true }),
  ]);

  assert.equal(issuedNotes.created.length, 1);
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(rejected.length, 1);
  assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof AlreadyIssuedError);
  await mock.close();
});
