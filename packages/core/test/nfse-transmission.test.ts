import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
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
import { FetchNationalNfseProvider, RealTransmissionNotReadyError, type NationalNfseProvider } from "../src/nfse/national-nfse-provider";
import type { NationalNfseResponseEnvelope } from "../src/nfse/dps-builder";
import {
  AlreadyIssuedError,
  CertificateNotConfiguredError,
  TransmissionService,
  TransmissionValidationError,
  UnresolvedUncertainAttemptError,
  type CertificateMaterialProvider,
  type TransmitDraftResult,
} from "../src/nfse/transmission-service";

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
  async findByOrigin(): Promise<NfseDraft | null> {
    return null;
  }
  async claimForTransmission(): Promise<void> {}
  async releaseTransmissionClaim(): Promise<void> {}
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

const FAKE_CERTIFICATE_INFO: NfseCertificateInfo = {
  id: "cert-1",
  subjectCnpj: "23970969000190",
  subjectName: "TESTE",
  issuerName: "AC TESTE",
  serialNumber: "01",
  fingerprint: "AA:BB:CC:DD",
  validFrom: "2026-01-01T00:00:00Z",
  validUntil: "2030-01-01T00:00:00Z",
  active: true,
  createdAt: "2026-01-01T00:00:00Z",
};

/** Chave/certificado de TESTE (node-forge, autoassinado) — nunca um certificado real. */
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
    async getActiveInfo() {
      return FAKE_CERTIFICATE_INFO;
    },
    async getActiveSigningMaterial() {
      return { privateKeyPem, certificatePem };
    },
  };
}

function makeUnconfiguredCertificateProvider(): CertificateMaterialProvider {
  return {
    async getActiveInfo() {
      return null;
    },
    async getActiveSigningMaterial() {
      return null;
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
  assert.equal(attempts.created.length, 2);
  assert.equal(attempts.created[0].status, "pending");
  assert.equal(attempts.created[1].status, "authorized");
});

test("rejeição NUNCA cria issued note — rascunho continua rascunho", async () => {
  const { service, issuedNotes, attempts } = makeService({ providerBehavior: "reject" });
  const result = await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  assert.equal(result.outcome, "rejected");
  assert.equal(issuedNotes.created.length, 0);
  // "pending" (rastreamento durável ANTES de chamar a SEFIN, auditoria 26/10/2026) + "rejected" (resultado final).
  assert.equal(attempts.created.length, 2);
  assert.equal(attempts.created[0].status, "pending");
  assert.equal(attempts.created[1].status, "rejected");
  assert.equal(attempts.created[1].rejectionCode, "E123");
});

test("falha de rede/timeout vira 'uncertain' — NUNCA retransmite automaticamente nem cria issued note", async () => {
  const { service, issuedNotes, attempts } = makeService({ providerBehavior: "throw" });
  const result = await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  assert.equal(result.outcome, "uncertain");
  assert.equal(issuedNotes.created.length, 0);
  assert.equal(attempts.created.length, 2);
  assert.equal(attempts.created[0].status, "pending");
  assert.equal(attempts.created[1].status, "uncertain");
});

test("proteção contra emissão duplicada — rascunho que já tem issued note nunca transmite de novo", async () => {
  const { service } = makeService({ providerBehavior: "authorize" });
  await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), AlreadyIssuedError);
});

test("tentativa anterior 'uncertain' bloqueia nova transmissão sem antes consultar o resultado real", async () => {
  const { service, attempts } = makeService({ providerBehavior: "authorize" });
  attempts.created.push({
    draftId: "draft-1", dpsSeries: "1", dpsNumber: 1, environment: "homologation",
    status: "uncertain", requestReference: "req-1", responseSummary: "timeout",
  });
  // listByDraftId é mockado pra devolver [] por padrão (ver FakeTransmissionAttemptRepository) —
  // injeta diretamente o retorno pra este teste específico, sem reescrever o fake compartilhado.
  (attempts as unknown as { listByDraftId: () => Promise<NfseTransmissionAttempt[]> }).listByDraftId =
    async () => [{ id: "attempt-1", createdAt: "2026-10-01T10:00:00Z", ...attempts.created[0] }];
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), UnresolvedUncertainAttemptError);
});

test("proteção contra chamadas simultâneas — segunda transmissão do mesmo rascunho é rejeitada enquanto a primeira está em andamento", async () => {
  const drafts = new FakeDraftRepository(makeDraft());
  let claims = 0;
  drafts.claimForTransmission = async () => {
    claims += 1;
    if (claims > 1) throw new Error("Este rascunho já está sendo transmitido agora");
  };
  const issuerConfigs = new FakeIssuerConfigRepository(makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  const provider = new FakeNationalNfseProvider("authorize");
  const certificate = makeConfiguredCertificateProvider();
  const service = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, provider, certificate);
  // Não aguarda a primeira terminar de propósito — simula duas chamadas concorrentes reais.
  const first = service.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), /já está sendo transmitido/);
  await first;
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

test("série da DPS ausente na configuração bloqueia a transmissão", async () => {
  const issuerConfig = makeIssuerConfig({ dpsSeries: undefined });
  const { service, dpsSequences } = makeService({ issuerConfig, providerBehavior: "authorize" });
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }));
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
  // Auditoria estrutural (26/10/2026, item 1): o "pending" é gravado ANTES de chamar o provider
  // (rastreamento durável) — mesmo o bloqueio de release deixa esse rastro, nunca 0 tentativas.
  // O erro de bloqueio continua propagando sem nunca virar "uncertain"/"authorized"/"rejected".
  assert.equal(attempts.created.length, 1);
  assert.equal(attempts.created[0].status, "pending");
  assert.equal(issuedNotes.created.length, 0);
});

test("auditoria estrutural (26/10/2026, item 1 — CRÍTICO): uma transmissão bem-sucedida grava 'pending' ANTES da linha final 'authorized' — nunca só a linha final", async () => {
  const { service, attempts } = makeService({ providerBehavior: "authorize" });
  await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  assert.equal(attempts.created.length, 2);
  assert.equal(attempts.created[0].status, "pending");
  assert.equal(attempts.created[1].status, "authorized");
  assert.equal(attempts.created[0].dpsNumber, attempts.created[1].dpsNumber);
  assert.equal(attempts.created[0].requestReference, attempts.created[1].requestReference, "mesmo requestReference liga as duas linhas da mesma tentativa");
});

test("auditoria estrutural (26/10/2026, item 1 — CRÍTICO): processo que nunca recebe resposta da SEFIN deixa 'pending' como rastro — próxima transmissão do mesmo rascunho é bloqueada até consulta manual, nunca retransmite sozinha", async () => {
  // Simula o processo morrendo DEPOIS de enviar (SEFIN pode ter recebido/autorizado) e ANTES de
  // qualquer outra linha ser gravada: um provider que nunca resolve/rejeita (pending puro).
  const neverResolves = {
    async getMunicipalParameters(): Promise<never> { throw new Error("not used"); },
    transmitDps: () => new Promise<never>(() => {}),
    async getNfseByAccessKey(): Promise<never> { throw new Error("not used"); },
    async getDpsById(): Promise<string | null> { return null; },
  };
  const drafts = new FakeDraftRepository(makeDraft());
  const issuerConfigs = new FakeIssuerConfigRepository(makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  // listByDraftId do fake padrão é um stub fixo ([]) — aqui precisa refletir o que foi
  // criado de verdade (mais recente primeiro), senão o teste não prova nada sobre o bloqueio real.
  attempts.listByDraftId = async (draftId: string) =>
    attempts.created
      .map((record, index): NfseTransmissionAttempt => ({ id: `attempt-${index + 1}`, createdAt: "2026-10-01T10:05:00Z", ...record }))
      .filter((a) => a.draftId === draftId)
      .reverse();
  const certificate = makeConfiguredCertificateProvider();
  const service = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, neverResolves, certificate);

  // Dispara a transmissão mas NUNCA espera ela terminar (simula o processo morrendo no meio).
  void service.transmit({ draftId: "draft-1", isAdminOrOwner: true }).catch(() => {});
  // Dá tempo pro "pending" ser gravado (ele é gravado de forma síncrona antes do await da rede).
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(attempts.created.length, 1);
  assert.equal(attempts.created[0].status, "pending");

  // Um NOVO TransmissionService (simula um processo reiniciado) tentando o MESMO rascunho
  // precisa ser bloqueado — nunca reservar outra DPS/retransmitir sozinho.
  const freshService = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, new FakeNationalNfseProvider("authorize"), certificate);
  await assert.rejects(() => freshService.transmit({ draftId: "draft-1", isAdminOrOwner: true }), UnresolvedUncertainAttemptError);
  assert.equal(dpsSequences.calls, 1, "a segunda tentativa nunca pode reservar um novo número de DPS");
});

// Bloco B, item 3 (25/10/2026) — concorrência real: mutex, idempotência e auditoria.
// Nunca usa fakes que só incrementam contador de chamadas (isso não prova nada sobre
// ordem/exclusão real); cada teste abaixo dispara chamadas de verdade via Promise.all
// e observa o resultado FINAL (quantas issued notes/tentativas existem), não a ordem
// das chamadas internas.

test("mutex real: duas transmissões do MESMO rascunho disparadas ao mesmo tempo — só uma autoriza, nunca duas issued notes", async () => {
  // Simula o mutex real (claim de linha no banco): só uma chamada pode estar "dentro"
  // por vez; a segunda que tentar claim enquanto a primeira não liberou é rejeitada —
  // mesmo contrato de DraftRepository.claimForTransmission (ver transmission-service.ts).
  const drafts = new FakeDraftRepository(makeDraft());
  let claimedBy: number | null = null;
  let nextCaller = 0;
  drafts.claimForTransmission = async () => {
    const caller = ++nextCaller;
    if (claimedBy !== null) throw new Error(`Este rascunho já está sendo transmitido agora (claim ativo de #${claimedBy}, tentativa de #${caller})`);
    claimedBy = caller;
  };
  drafts.releaseTransmissionClaim = async () => {
    claimedBy = null;
  };
  const issuerConfigs = new FakeIssuerConfigRepository(makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  const provider = new FakeNationalNfseProvider("authorize");
  const certificate = makeConfiguredCertificateProvider();
  const service = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, provider, certificate);

  const results = await Promise.allSettled([
    service.transmit({ draftId: "draft-1", isAdminOrOwner: true }),
    service.transmit({ draftId: "draft-1", isAdminOrOwner: true }),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exatamente uma das duas chamadas concorrentes deve ter sido autorizada");
  assert.equal(rejected.length, 1, "a outra deve ter sido rejeitada pelo mutex, nunca silenciosamente ignorada");
  assert.match((rejected[0] as PromiseRejectedResult).reason.message, /já está sendo transmitido/);
  assert.equal(issuedNotes.created.length, 1, "nunca duas issued notes para o mesmo rascunho, mesmo sob concorrência real");
  assert.equal(claimedBy, null, "o claim precisa estar liberado ao final, mesmo com uma das duas chamadas tendo lançado erro");
});

test("mutex é SEMPRE liberado mesmo quando a transmissão falha antes de chamar o provider (certificado ausente) — próxima chamada nunca fica bloqueada por um claim esquecido", async () => {
  const drafts = new FakeDraftRepository(makeDraft());
  let claimed = false;
  drafts.claimForTransmission = async () => {
    if (claimed) throw new Error("Este rascunho já está sendo transmitido agora");
    claimed = true;
  };
  drafts.releaseTransmissionClaim = async () => {
    claimed = false;
  };
  const issuerConfigs = new FakeIssuerConfigRepository(makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  const provider = new FakeNationalNfseProvider("authorize");

  // Primeira chamada: certificado ausente -> falha ANTES de reservar DPS/transmitir,
  // mas o claim precisa ser liberado no finally (ver transmission-service.ts, transmit()).
  const serviceWithoutCertificate = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, provider, makeUnconfiguredCertificateProvider());
  await assert.rejects(() => serviceWithoutCertificate.transmit({ draftId: "draft-1", isAdminOrOwner: true }), CertificateNotConfiguredError);
  assert.equal(claimed, false, "claim precisa estar liberado depois do erro");

  // Segunda chamada, agora com certificado configurado: nunca deve ser bloqueada por um claim esquecido da primeira.
  const serviceWithCertificate = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, provider, makeConfiguredCertificateProvider());
  const result = await serviceWithCertificate.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  assert.equal(result.outcome, "authorized");
});

test("auditoria estrutural (26/10/2026, item 1): falha ao LIBERAR o mutex depois de uma autorização bem-sucedida propaga o erro de liberação, mas NUNCA perde o resultado fiscal já gravado — a próxima tentativa vê AlreadyIssuedError, nunca duplica", async () => {
  const drafts = new FakeDraftRepository(makeDraft());
  drafts.claimForTransmission = async () => {};
  drafts.releaseTransmissionClaim = async () => {
    throw new Error("Falha de conexão com o banco ao liberar o mutex — simula o pior caso: autorizou, gravou, e só a liberação falhou.");
  };
  const issuerConfigs = new FakeIssuerConfigRepository(makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  attempts.listByDraftId = async (draftId: string) =>
    attempts.created
      .map((record, index): NfseTransmissionAttempt => ({ id: `attempt-${index + 1}`, createdAt: "2026-10-01T10:05:00Z", ...record }))
      .filter((a) => a.draftId === draftId)
      .reverse();
  const provider = new FakeNationalNfseProvider("authorize");
  const certificate = makeConfiguredCertificateProvider();
  const service = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, provider, certificate);

  // A chamada em si rejeita (com o erro de liberação) — mas isso NUNCA significa que a
  // transmissão falhou de verdade: os dados já foram gravados antes do finally executar.
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), /Falha de conexão/);
  assert.equal(issuedNotes.created.length, 1, "a nota emitida precisa continuar gravada, mesmo com a liberação do mutex falhando depois");
  assert.equal(attempts.created.some((a) => a.status === "authorized"), true);

  // Uma tentativa seguinte (ex.: processo reiniciado, usuário tentando de novo por engano
  // achando que falhou) NUNCA pode gerar uma segunda NFS-e pro mesmo rascunho.
  drafts.releaseTransmissionClaim = async () => {};
  await assert.rejects(() => service.transmit({ draftId: "draft-1", isAdminOrOwner: true }), AlreadyIssuedError);
  assert.equal(issuedNotes.created.length, 1, "nunca duas notas emitidas pro mesmo rascunho, mesmo depois de uma falha de liberação do mutex");
});

test("idempotência real (backstop da constraint UNIQUE): duas autorizações concorrentes pro mesmo rascunho — mesmo que o mutex falhasse/fosse burlado, nunca duas issued notes", async () => {
  // Mutex deliberadamente NUNCA bloqueia aqui (claim sempre permitido) — testa só o
  // backstop real (constraint UNIQUE em nfse_issued_notes.draft_id, ver
  // FakeIssuedNoteRepository.create e o catch em transmitClaimed()), nunca o mutex em si.
  const drafts = new FakeDraftRepository(makeDraft());
  drafts.claimForTransmission = async () => {};
  drafts.releaseTransmissionClaim = async () => {};
  const issuerConfigs = new FakeIssuerConfigRepository(makeIssuerConfig());
  const dpsSequences = new FakeDpsSequenceRepository();
  const issuedNotes = new FakeIssuedNoteRepository();
  const attempts = new FakeTransmissionAttemptRepository();
  const provider = new FakeNationalNfseProvider("authorize");
  const certificate = makeConfiguredCertificateProvider();
  const service = new TransmissionService(drafts, issuerConfigs, dpsSequences, issuedNotes, attempts, provider, certificate);

  const results = await Promise.allSettled([
    service.transmit({ draftId: "draft-1", isAdminOrOwner: true }),
    service.transmit({ draftId: "draft-1", isAdminOrOwner: true }),
  ]);

  const fulfilled = results.filter((r): r is PromiseFulfilledResult<TransmitDraftResult> => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(issuedNotes.created.length, 1, "o backstop real (constraint UNIQUE) nunca deixa passar duas issued notes pro mesmo draft_id");
  assert.equal(fulfilled.length, 1);
  assert.equal(fulfilled[0].value.outcome, "authorized");
  assert.equal(rejected.length, 1);
  assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof AlreadyIssuedError, "a segunda chamada precisa virar AlreadyIssuedError, nunca um erro genérico de banco exposto ao chamador");
});

test("auditoria: cada tentativa de transmissão bem-sucedida gera 'pending'+'authorized' em TransmissionAttemptRepository, nunca zero nem a linha final sem o rastro durável antes", async () => {
  const { service, attempts, issuedNotes } = makeService({ providerBehavior: "authorize" });
  await service.transmit({ draftId: "draft-1", isAdminOrOwner: true });
  assert.equal(attempts.created.length, 2);
  assert.equal(attempts.created[0].status, "pending");
  assert.equal(attempts.created[1].status, "authorized");
  assert.equal(attempts.created[1].issuedNoteId, issuedNotes.created.length === 1 ? (await issuedNotes.getByDraftId("draft-1"))?.id : undefined);
});

// Parte 2B — guarda central de prontidão (readiness.ts), exposta via checkReadiness().

test("checkReadiness: pacote XSD vendorizado (20261020) agora corresponde ao exigido pelo Portal — item de versão não aparece mais em missing", async () => {
  const { service, dpsSequences } = makeService({ providerBehavior: "authorize" });
  const readiness = await service.checkReadiness("draft-1");
  assert.ok(!readiness.missing.some((item) => item.includes("Pacote XSD")));
  // checkReadiness nunca reserva um número de DPS de verdade.
  assert.equal(dpsSequences.calls, 0);
});

test("checkReadiness: sem certificado configurado -> lista o certificado como faltante", async () => {
  const { service } = makeService({ providerBehavior: "authorize", certificateConfigured: false });
  const readiness = await service.checkReadiness("draft-1");
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missing.some((item) => item.includes("Certificado")));
});

test("checkReadiness: sem Simples Nacional configurado no prestador -> lista o item exato (nunca mensagem genérica)", async () => {
  const issuerConfig = makeIssuerConfig({ simplesNacionalOption: undefined });
  const { service } = makeService({ issuerConfig, providerBehavior: "authorize" });
  const readiness = await service.checkReadiness("draft-1");
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missing.some((item) => item.includes("Simples Nacional")));
});

test("checkReadiness: sem regime especial de tributação configurado no prestador -> lista o item exato", async () => {
  const issuerConfig = makeIssuerConfig({ specialTaxRegimeCode: undefined });
  const { service } = makeService({ issuerConfig, providerBehavior: "authorize" });
  const readiness = await service.checkReadiness("draft-1");
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missing.some((item) => item.includes("Regime especial")));
});
