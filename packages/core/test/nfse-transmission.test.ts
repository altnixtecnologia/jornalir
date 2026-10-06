import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import type { NfseDraft, NfseIssuerConfig, NfseIssuedNote, NfseTransmissionAttempt } from "@ir/types";
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
import { FetchNationalNfseProvider, RealTransmissionNotReadyError, type NationalNfseProvider } from "../src/nfse/national-nfse-provider";
import type { NationalNfseResponseEnvelope } from "../src/nfse/dps-builder";
import {
  AlreadyIssuedError,
  CertificateNotConfiguredError,
  TransmissionService,
  TransmissionValidationError,
  type CertificateSigningProvider,
} from "../src/nfse/transmission-service";

function makeDraft(overrides: Partial<NfseDraft> = {}): NfseDraft {
  return {
    id: "draft-1",
    reference: "IR-NFSE-2026-000001",
    clientId: "client-1",
    tomador: { sourceClientId: "client-1", kind: "individual", name: "Maria Souza", cpf: "11144477735", city: "São João do Sul", state: "SC" },
    serviceProfileId: "profile-1",
    fiscal: { sourceServiceProfileId: "profile-1", cTribNac: "010101", issqnRate: 5 },
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
    // Escolha de TESTE pra exercitar o resto do fluxo — nunca afirma
    // que este é o algoritmo oficialmente exigido (ver signature.ts).
    signatureAlgorithm: "rsa-sha256",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

class FakeDraftRepository implements DraftRepository {
  constructor(private readonly draft: NfseDraft | null) {}
  async list() {
    return this.draft ? [this.draft] : [];
  }
  async getById(id: string) {
    return this.draft && this.draft.id === id ? this.draft : null;
  }
  async create(_record: NewDraftRecord): Promise<NfseDraft> {
    throw new Error("not used in these tests");
  }
  async update(): Promise<NfseDraft> {
    throw new Error("not used in these tests");
  }
}

class FakeIssuerConfigRepository implements IssuerConfigRepository {
  constructor(private readonly config: NfseIssuerConfig | null) {}
  async getCurrent() {
    return this.config;
  }
  async create(): Promise<NfseIssuerConfig> {
    throw new Error("not used in these tests");
  }
  async update(): Promise<NfseIssuerConfig> {
    throw new Error("not used in these tests");
  }
}

class FakeDpsSequenceRepository implements DpsSequenceRepository {
  public calls = 0;
  async reserveNext() {
    this.calls += 1;
    return this.calls;
  }
}

class FakeIssuedNoteRepository implements IssuedNoteRepository {
  public created: NewIssuedNoteRecord[] = [];
  private readonly byDraft = new Map<string, NfseIssuedNote>();
  async listAll() {
    return [...this.byDraft.values()];
  }
  async getByDraftId(draftId: string) {
    return this.byDraft.get(draftId) ?? null;
  }
  async getById(id: string) {
    return [...this.byDraft.values()].find((note) => note.id === id) ?? null;
  }
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
  async listByDraftId() {
    return [] as NfseTransmissionAttempt[];
  }
  async create(record: NewTransmissionAttemptRecord): Promise<NfseTransmissionAttempt> {
    this.created.push(record);
    return { id: `attempt-${this.created.length}`, createdAt: "2026-10-01T10:05:00Z", ...record };
  }
}

type ProviderBehavior = "authorize" | "reject" | "throw";

class FakeNationalNfseProvider implements NationalNfseProvider {
  constructor(private readonly behavior: ProviderBehavior) {}
  async getMunicipalParameters(): Promise<never> {
    throw new Error("not used in these tests");
  }
  async transmitDps(): Promise<NationalNfseResponseEnvelope> {
    if (this.behavior === "throw") throw new Error("network timeout");
    if (this.behavior === "reject") return { status: "rejected", rejection: { code: "E123", message: "CNPJ do tomador inválido" } };
    return { status: "authorized", accessKey: "ACCESSKEY123", nfseNumber: "1", issuedAt: "2026-10-01T10:05:00Z", nfseXml: "<NFSe/>" };
  }
  async getNfseByAccessKey(): Promise<string> {
    throw new Error("not used in these tests");
  }
  async getDpsById(): Promise<string | null> {
    return null;
  }
}

function makeConfiguredCertificateProvider(): CertificateSigningProvider {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  return {
    isConfigured: () => true,
    getSigningKeyMaterial: () => ({ privateKeyPem, certificatePem: "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----" }),
  };
}

function makeUnconfiguredCertificateProvider(): CertificateSigningProvider {
  return {
    isConfigured: () => false,
    getSigningKeyMaterial: () => {
      throw new Error("Certificado não configurado.");
    },
  };
}

function makeService(opts: {
  draft?: NfseDraft | null;
  issuerConfig?: NfseIssuerConfig | null;
  providerBehavior?: ProviderBehavior;
  certificateConfigured?: boolean;
}) {
  const drafts = new FakeDraftRepository(opts.draft ?? makeDraft());
  const issuerConfigs = new FakeIssuerConfigRepository(opts.issuerConfig ?? makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  const provider = new FakeNationalNfseProvider(opts.providerBehavior ?? "authorize");
  const certificate = opts.certificateConfigured === false ? makeUnconfiguredCertificateProvider() : makeConfiguredCertificateProvider();
  const service = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, provider, certificate);
  return { service, issuedNotes, attempts, dpsSequences };
}

// Parte 2A, item 20.

test("autorização cria issued note e registra tentativa 'authorized' — nunca inventa número/chave", async () => {
  const { service, issuedNotes, attempts } = makeService({ providerBehavior: "authorize" });
  const result = await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  assert.equal(result.outcome, "authorized");
  assert.equal(issuedNotes.created.length, 1);
  assert.equal(issuedNotes.created[0].accessKey, "ACCESSKEY123");
  assert.equal(issuedNotes.created[0].nfseNumber, "1");
  assert.equal(attempts.created.length, 1);
  assert.equal(attempts.created[0].status, "authorized");
});

test("rejeição NUNCA cria issued note — rascunho continua rascunho", async () => {
  const { service, issuedNotes, attempts } = makeService({ providerBehavior: "reject" });
  const result = await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  assert.equal(result.outcome, "rejected");
  assert.equal(issuedNotes.created.length, 0);
  assert.equal(attempts.created.length, 1);
  assert.equal(attempts.created[0].status, "rejected");
  assert.equal(attempts.created[0].rejectionCode, "E123");
});

test("falha de rede/timeout vira 'uncertain' — NUNCA retransmite automaticamente nem cria issued note", async () => {
  const { service, issuedNotes, attempts } = makeService({ providerBehavior: "throw" });
  const result = await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  assert.equal(result.outcome, "uncertain");
  assert.equal(issuedNotes.created.length, 0);
  assert.equal(attempts.created.length, 1);
  assert.equal(attempts.created[0].status, "uncertain");
});

test("proteção contra emissão duplicada — rascunho que já tem issued note nunca transmite de novo", async () => {
  const { service } = makeService({ providerBehavior: "authorize" });
  await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), AlreadyIssuedError);
});

test("certificado ausente bloqueia a transmissão antes de reservar DPS/montar XML", async () => {
  const { service, dpsSequences, attempts } = makeService({ providerBehavior: "authorize", certificateConfigured: false });
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), CertificateNotConfiguredError);
  assert.equal(dpsSequences.calls, 0);
  assert.equal(attempts.created.length, 0);
});

test("confirma owner/admin antes de qualquer outra etapa", async () => {
  const { service, dpsSequences } = makeService({ providerBehavior: "authorize" });
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: false }));
  assert.equal(dpsSequences.calls, 0);
});

test("rascunho incompleto (sem alíquota ISSQN configurada) bloqueia a transmissão", async () => {
  const draft = makeDraft({ fiscal: { sourceServiceProfileId: "profile-1", cTribNac: "010101" } });
  const { service, dpsSequences } = makeService({ draft, providerBehavior: "authorize" });
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }));
  assert.equal(dpsSequences.calls, 0);
});

test("série da DPS ausente na configuração bloqueia a transmissão", async () => {
  const issuerConfig = makeIssuerConfig({ dpsSeries: undefined });
  const { service, dpsSequences } = makeService({ issuerConfig, providerBehavior: "authorize" });
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }));
  assert.equal(dpsSequences.calls, 0);
});

test("ajuste de segurança: algoritmo de assinatura ausente bloqueia a transmissão — nunca assume um default", async () => {
  const issuerConfig = makeIssuerConfig({ signatureAlgorithm: undefined });
  const { service, dpsSequences } = makeService({ issuerConfig, providerBehavior: "authorize" });
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), TransmissionValidationError);
  assert.equal(dpsSequences.calls, 0);
});

test("ajuste de segurança: série em formato inválido bloqueia a transmissão (sem faixa semântica não confirmada)", async () => {
  const issuerConfig = makeIssuerConfig({ dpsSeries: "abcdef" });
  const { service, dpsSequences } = makeService({ issuerConfig, providerBehavior: "authorize" });
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), TransmissionValidationError);
  assert.equal(dpsSequences.calls, 0);
});

test("ajuste de segurança: o provider real (FetchNationalNfseProvider) nunca chama a API — toda chamada é bloqueada explicitamente", async () => {
  const provider = new FetchNationalNfseProvider();
  await assert.rejects(() => provider.transmitDps("<DPS/>", "homologation"), RealTransmissionNotReadyError);
  await assert.rejects(() => provider.getMunicipalParameters("4216404", "homologation"), RealTransmissionNotReadyError);
  await assert.rejects(() => provider.getNfseByAccessKey("ACCESSKEY", "homologation"), RealTransmissionNotReadyError);
  await assert.rejects(() => provider.getDpsById("dps-id", "homologation"), RealTransmissionNotReadyError);
});

test("ajuste de segurança: bloqueio do provider real nunca é tratado como 'uncertain' — propaga explicitamente", async () => {
  const drafts = new FakeDraftRepository(makeDraft());
  const issuerConfigs = new FakeIssuerConfigRepository(makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  const certificate = makeConfiguredCertificateProvider();
  const service = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, new FetchNationalNfseProvider(), certificate);
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), RealTransmissionNotReadyError);
  assert.equal(attempts.created.length, 0);
  assert.equal(issuedNotes.created.length, 0);
});
