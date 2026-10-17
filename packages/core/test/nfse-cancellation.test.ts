import { test } from "node:test";
import assert from "node:assert/strict";
import type { NfseCancellationRequest, NfseIssuedNote } from "@ir/types";
import type { CancellationRequestRepository, NewCancellationRequestRecord, IssuedNoteRepository, NewIssuedNoteRecord } from "../src/nfse";
import {
  CancellationAlreadyRequestedError, CancellationPermissionError, CancellationService,
  CancellationSubmissionNotReadyError, InvalidCancellationJustificationError, IssuedNoteNotFoundError,
} from "../src/nfse/cancellation-service";

const ISSUED_NOTE: NfseIssuedNote = {
  id: "note-1", draftId: "draft-1", issuerConfigId: "issuer-1", clientId: "client-1",
  environment: "homologation", dpsSeries: "1", dpsNumber: 1, dpsId: "DPS1",
  accessKey: "ACCESSKEY1", nfseNumber: "1", issuedAt: "2026-10-01T10:00:00Z",
  competencyDate: "2026-10-01", serviceValue: 100, signedDpsXml: "<xml/>",
  createdAt: "2026-10-01T10:00:00Z",
};

class FakeIssuedNoteRepository implements IssuedNoteRepository {
  constructor(private readonly note: NfseIssuedNote | null) {}
  async listAll() { return this.note ? [this.note] : []; }
  async getByDraftId() { return this.note; }
  async getById(id: string) { return this.note && this.note.id === id ? this.note : null; }
  async create(_record: NewIssuedNoteRecord): Promise<NfseIssuedNote> { throw new Error("not used in these tests"); }
}

class FakeCancellationRequestRepository implements CancellationRequestRepository {
  public created: NewCancellationRequestRecord[] = [];
  public activeOverride: NfseCancellationRequest | null = null;
  async listByIssuedNoteId(issuedNoteId: string) {
    return this.created
      .filter((item) => item.issuedNoteId === issuedNoteId)
      .map((item, index): NfseCancellationRequest => ({
        id: `cancellation-${index + 1}`, status: "pending", requestedAt: "2026-10-17T10:00:00Z",
        createdAt: "2026-10-17T10:00:00Z", ...item,
      }));
  }
  async getActiveByIssuedNoteId() { return this.activeOverride; }
  async create(record: NewCancellationRequestRecord): Promise<NfseCancellationRequest> {
    this.created.push(record);
    return {
      id: `cancellation-${this.created.length}`, status: "pending",
      requestedAt: "2026-10-17T10:00:00Z", createdAt: "2026-10-17T10:00:00Z", ...record,
    };
  }
}

function makeService(opts: { note?: NfseIssuedNote | null } = {}) {
  const issuedNotes = new FakeIssuedNoteRepository(opts.note === undefined ? ISSUED_NOTE : opts.note);
  const requests = new FakeCancellationRequestRepository();
  return { service: new CancellationService(issuedNotes, requests), requests };
}

test("requestCancellation exige owner/admin antes de qualquer outra etapa", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.requestCancellation({
      issuedNoteId: "note-1", justificationCode: 1, justificationText: "Erro na emissão do valor do serviço",
      isAdminOrOwner: false,
    }),
    CancellationPermissionError,
  );
});

test("requestCancellation identifica a nota autorizada — lança erro claro se não existir", async () => {
  const { service } = makeService({ note: null });
  await assert.rejects(
    () => service.requestCancellation({
      issuedNoteId: "note-inexistente", justificationCode: 1, justificationText: "Erro na emissão do valor do serviço",
      isAdminOrOwner: true,
    }),
    IssuedNoteNotFoundError,
  );
});

test("requestCancellation rejeita código de justificativa fora de 1/2/9 — nunca inventa um novo código", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.requestCancellation({
      issuedNoteId: "note-1", justificationCode: 5 as 1, justificationText: "Qualquer texto com mais de 15 caracteres",
      isAdminOrOwner: true,
    }),
    InvalidCancellationJustificationError,
  );
});

test("requestCancellation rejeita justificativa fora do limite oficial (15 a 255 caracteres, TSMotivo)", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.requestCancellation({ issuedNoteId: "note-1", justificationCode: 9, justificationText: "curto", isAdminOrOwner: true }),
    InvalidCancellationJustificationError,
  );
});

test("requestCancellation prepara e registra a solicitação com sucesso — status sempre 'pending', nunca enviada", async () => {
  const { service, requests } = makeService();
  const result = await service.requestCancellation({
    issuedNoteId: "note-1", justificationCode: 2, justificationText: "O serviço contratado não foi prestado ao cliente",
    isAdminOrOwner: true, actorProfileId: "actor-1",
  });
  assert.equal(result.status, "pending");
  assert.equal(requests.created.length, 1);
  assert.equal(requests.created[0].justificationCode, 2);
});

test("evita cancelamentos repetidos — já existe solicitação ativa pra mesma nota", async () => {
  const { service, requests } = makeService();
  requests.activeOverride = {
    id: "existing", issuedNoteId: "note-1", justificationCode: 1, justificationText: "Primeira solicitação já registrada antes",
    status: "pending", requestedAt: "2026-10-17T09:00:00Z", createdAt: "2026-10-17T09:00:00Z",
  };
  await assert.rejects(
    () => service.requestCancellation({
      issuedNoteId: "note-1", justificationCode: 1, justificationText: "Segunda tentativa de cancelamento duplicada",
      isAdminOrOwner: true,
    }),
    CancellationAlreadyRequestedError,
  );
});

test("submitCancellation nunca envia o cancelamento real nesta fase — sempre bloqueado explicitamente", async () => {
  const { service } = makeService();
  await assert.rejects(() => service.submitCancellation("cancellation-1"), CancellationSubmissionNotReadyError);
});
