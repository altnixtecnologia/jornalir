import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import type { NfseCancellationRequest, NfseIssuedNote, NfseIssuerConfig, NfseCertificateInfo } from "@ir/types";
import type { CancellationEventProvider } from "../src/nfse/cancellation-service";
import type { CancellationSubmissionRepository } from "../src/nfse/cancellation-submission-repository";
import type { IssuedNoteRepository } from "../src/nfse/issued-note-repository";
import type { IssuerConfigRepository } from "../src/nfse/issuer-config-repository";
import type { CertificateMaterialProvider } from "../src/nfse/transmission-service";
import { CancellationInProgressError, CancellationNotReadyError, RestrictedCancellationDispatchService } from "../src/nfse/cancellation-dispatch-service";

const KEY = "421640" + "99299999999999" + "999999999990000000001202610001";
const CNPJ = "23970969000190";
const issuer = {
  id: "issuer-test",
  cnpj: CNPJ,
  environment: "homologation",
} as NfseIssuerConfig;
const note: NfseIssuedNote = {
  id: "note-test", draftId: "draft-test", issuerConfigId: issuer.id,
  clientId: "client-test", environment: "homologation",
  dpsSeries: "1", dpsNumber: 1, dpsId: "DPS-TEST",
  accessKey: KEY, nfseNumber: "1", issuedAt: "2026-11-12T10:00:00Z",
  competencyDate: "2026-11-12", serviceValue: 100,
  signedDpsXml: "<DPS/>", createdAt: "2026-11-12T10:00:00Z",
};
const originalRequest: NfseCancellationRequest = {
  id: "cancel-test", issuedNoteId: note.id, status: "pending",
  justificationCode: 1, justificationText: "Erro de digitação no valor informado no serviço.",
  requestedAt: "2026-11-12T10:00:00Z", createdAt: "2026-11-12T10:00:00Z",
};

function fakeCertificate(): CertificateMaterialProvider {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2026-01-01T00:00:00Z");
  cert.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const attrs = [{ name: "commonName", value: `TESTE:${CNPJ}` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const info: NfseCertificateInfo = {
    id: "cert-test", subjectCnpj: CNPJ,
    serialNumber: "01", fingerprint: "FAKE",
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2030-01-01T00:00:00Z",
    active: true, createdAt: "2026-01-01T00:00:00Z",
  };
  return {
    async getActiveInfo() { return info; },
    async getActiveSigningMaterial() {
      return { certificatePem: forge.pki.certificateToPem(cert), privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey) };
    },
  };
}

class FakeSubmissionRepo implements CancellationSubmissionRepository {
  current = { ...originalRequest };
  claims = 0;
  async getById(id: string) { return id === this.current.id ? this.current : null; }
  async claimPending(id: string) {
    if (this.current.id !== id || this.current.status !== "pending") return null;
    this.current.status = "submitted";
    this.claims++;
    return this.current;
  }
  async settleSubmitted(id: string, result: Parameters<CancellationSubmissionRepository["settleSubmitted"]>[1]) {
    assert.equal(this.current.id, id);
    assert.equal(this.current.status, "submitted");
    this.current = { ...this.current, status: result.status, responseSummary: result.responseSummary,
      rejectionCode: result.rejectionCode, rejectionMessage: result.rejectionMessage };
    return this.current;
  }
}

function makeService(opts: {
  outcome?: "confirmed" | "rejected" | "incomplete" | "timeout";
  note?: NfseIssuedNote;
  issuer?: NfseIssuerConfig;
  repository?: FakeSubmissionRepo;
  certificate?: CertificateMaterialProvider;
} = {}) {
  const repo = opts.repository ?? new FakeSubmissionRepo();
  let sends = 0;
  const events: CancellationEventProvider = {
    async submitCancellationEvent(signedXml, accessKey, environment) {
      sends++;
      assert.equal(accessKey, KEY);
      assert.equal(environment, "homologation");
      assert.match(signedXml, /<Signature/);
      if (opts.outcome === "timeout") throw new Error("socket timeout");
      if (opts.outcome === "rejected") return { status: "rejected", rejection: { code: "E001", message: "Pedido rejeitado" } };
      if (opts.outcome === "incomplete") return { status: "registered", eventXml: "<evento/>" };
      return { status: "registered", eventXml: `<evento><chNFSe>${KEY}</chNFSe><tpEvento>101101</tpEvento></evento>` };
    },
    async getEventsByAccessKey() { return "[]"; },
  };
  const issued = { async getById() { return opts.note ?? note; } } as unknown as IssuedNoteRepository;
  const configs = { async getCurrent() { return opts.issuer ?? issuer; } } as unknown as IssuerConfigRepository;
  const service = new RestrictedCancellationDispatchService(
    issued, repo, configs, opts.certificate ?? fakeCertificate(), events,
  );
  return { service, repo, getSends: () => sends };
}

test("confirmacao de evento exige XML oficial com chave correspondente", async () => {
  const { service, repo, getSends } = makeService();
  const result = await service.submit("cancel-test", true);
  assert.equal(result.outcome, "confirmed");
  assert.equal(result.request.status, "confirmed");
  assert.equal(repo.claims, 1);
  assert.equal(getSends(), 1);
});

test("rejeicao explicita permite registrar rejeicao; nunca e confundida com timeout", async () => {
  const { service, repo } = makeService({ outcome: "rejected" });
  const result = await service.submit("cancel-test", true);
  assert.equal(result.outcome, "rejected");
  assert.equal(repo.current.rejectionCode, "E001");
});

test("resposta de sucesso sem chave ou tipo e INCERTA", async () => {
  const { service, repo } = makeService({ outcome: "incomplete" });
  assert.equal((await service.submit("cancel-test", true)).outcome, "uncertain");
  assert.equal(repo.current.status, "uncertain");
});

test("timeout depois do envio deixa pedido incerto e impede novo POST", async () => {
  const { service, repo, getSends } = makeService({ outcome: "timeout" });
  assert.equal((await service.submit("cancel-test", true)).outcome, "uncertain");
  await assert.rejects(() => service.submit("cancel-test", true), CancellationInProgressError);
  assert.equal(repo.current.status, "uncertain");
  assert.equal(getSends(), 1);
});

test("duas requisicoes concorrentes jamais enviam dois cancelamentos", async () => {
  const { service, repo, getSends } = makeService();
  const results = await Promise.allSettled([service.submit("cancel-test", true), service.submit("cancel-test", true)]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(results.filter(x => x.status === "rejected").length, 1);
  assert.equal(repo.claims, 1);
  assert.equal(getSends(), 1);
});

test("sem permissao ou com nota de producao nao assina nem envia", async () => {
  const { service, repo, getSends } = makeService();
  await assert.rejects(() => service.submit("cancel-test", false), CancellationNotReadyError);
  assert.equal(repo.claims, 0);
  assert.equal(getSends(), 0);
  const prod = makeService({ note: { ...note, environment: "production" } });
  await assert.rejects(() => prod.service.submit("cancel-test", true), CancellationNotReadyError);
  assert.equal(prod.repo.claims, 0);
});

test("chave oficial que nao satisfaz XSD do evento bloqueia ANTES do POST", async () => {
  const wrong = makeService({ note: { ...note, accessKey: "4216404199999999999999999999990000000001202610001" } });
  await assert.rejects(() => wrong.service.submit("cancel-test", true), /XSD|Chave de acesso/);
  assert.equal(wrong.repo.claims, 0);
  assert.equal(wrong.getSends(), 0);
});
