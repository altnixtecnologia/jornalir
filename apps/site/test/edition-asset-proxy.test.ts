import test from "node:test";
import assert from "node:assert/strict";
import {
  handleEditionAssetRequest,
  type EditionAssetDeps,
} from "../src/lib/server/editionAssetProxy";
import {
  EditionObjectNotFoundError,
  EditionRangeNotSatisfiableError,
} from "../src/lib/server/editionsR2";

const VALID_ID = "9f2a3b10-0000-4000-8000-000000000776";

function fakeBodyStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

interface MockEdition {
  id: string;
  active: boolean;
  archive_provider: string | null;
  pdf_r2_key: string | null;
  cover_r2_key: string | null;
  edition_number: number;
}

const EDITION_776: MockEdition = {
  id: VALID_ID,
  active: true,
  archive_provider: "r2",
  pdf_r2_key: "acervo/edicoes/IR 776.pdf",
  cover_r2_key: "jornal-online/2026/edicao-0776/capa-abc123.webp",
  edition_number: 776,
};

function baseDeps(overrides: Partial<EditionAssetDeps> = {}): EditionAssetDeps {
  return {
    isR2Configured: () => true,
    lookupEdition: async () => EDITION_776,
    headObject: async () => ({ contentLength: 1000, contentType: "application/pdf", etag: '"abc"' }),
    getObjectRange: async () => ({
      body: fakeBodyStream(new Uint8Array([1, 2, 3, 4])),
      status: 200,
      contentLength: 4,
      totalSize: 1000,
      contentRange: null,
      contentType: "application/pdf",
      etag: '"abc"',
    }),
    ...overrides,
  };
}

test("GET sem Range: 200, Content-Length e Accept-Ranges presentes, Content-Disposition inline", async () => {
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: false },
    baseDeps(),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.equal(response.headers.get("Content-Length"), "4");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.match(response.headers.get("Content-Disposition") ?? "", /^inline; filename="IR-776\.pdf"/);
  assert.equal(response.headers.get("ETag"), '"abc"');
});

test("GET com Range: 206 e Content-Range repassados", async () => {
  const deps = baseDeps({
    getObjectRange: async (_key, range) => {
      assert.equal(range, "bytes=0-99");
      return {
        body: fakeBodyStream(new Uint8Array(100)),
        status: 206,
        contentLength: 100,
        totalSize: 1000,
        contentRange: "bytes 0-99/1000",
        contentType: "application/pdf",
        etag: '"abc"',
      };
    },
  });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: "bytes=0-99", download: false },
    deps,
  );
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 0-99/1000");
  assert.equal(response.headers.get("Content-Length"), "100");
});

test("HEAD: 200 sem corpo, mas com Content-Length/ETag; nunca chama getObjectRange", async () => {
  let getObjectRangeCalled = false;
  const deps = baseDeps({
    getObjectRange: async () => {
      getObjectRangeCalled = true;
      throw new Error("não deveria ser chamado em HEAD");
    },
  });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "HEAD", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("Content-Length"), "1000");
  assert.equal(getObjectRangeCalled, false);
});

test("download=1: Content-Disposition attachment com nome amigável IR-776.pdf", async () => {
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: true },
    baseDeps(),
  );
  assert.match(response.headers.get("Content-Disposition") ?? "", /^attachment; filename="IR-776\.pdf"/);
});

test("capa usa nome amigável e content-type image/webp", async () => {
  const deps = baseDeps({
    getObjectRange: async () => ({
      body: fakeBodyStream(new Uint8Array([1])),
      status: 200,
      contentLength: 1,
      totalSize: 1,
      contentRange: null,
      contentType: "image/webp",
      etag: null,
    }),
  });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "cover", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.headers.get("Content-Type"), "image/webp");
  assert.match(response.headers.get("Content-Disposition") ?? "", /filename="IR-776-capa\.webp"/);
});

test("id com formato inválido: 404 sem consultar Supabase nem R2", async () => {
  let lookupCalled = false;
  const deps = baseDeps({ lookupEdition: async () => { lookupCalled = true; return EDITION_776; } });
  const response = await handleEditionAssetRequest(
    { id: "../../etc/passwd", kind: "pdf", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.status, 404);
  assert.equal(lookupCalled, false);
});

test("edição inexistente (lookup retorna null): 404", async () => {
  const deps = baseDeps({ lookupEdition: async () => null });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.status, 404);
});

test("edição inativa: 404, mesmo existindo no Supabase", async () => {
  const deps = baseDeps({ lookupEdition: async () => ({ ...EDITION_776, active: false }) });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.status, 404);
});

test("edição não é do provedor r2 (legado): 404 — este caminho só serve edições R2", async () => {
  const deps = baseDeps({ lookupEdition: async () => ({ ...EDITION_776, archive_provider: "drive" }) });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.status, 404);
});

test("edição R2 sem pdf_r2_key (capa sem cover_r2_key): 404", async () => {
  const deps = baseDeps({ lookupEdition: async () => ({ ...EDITION_776, pdf_r2_key: null }) });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.status, 404);
});

test("R2 não configurado: 503, sem consultar Supabase", async () => {
  let lookupCalled = false;
  const deps = baseDeps({
    isR2Configured: () => false,
    lookupEdition: async () => { lookupCalled = true; return EDITION_776; },
  });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.status, 503);
  assert.equal(lookupCalled, false);
});

test("Supabase indisponível (lookup lança erro): 503", async () => {
  const deps = baseDeps({ lookupEdition: async () => { throw new Error("timeout"); } });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.status, 503);
});

test("objeto ausente no R2 (chave órfã): 404", async () => {
  const deps = baseDeps({
    getObjectRange: async () => { throw new EditionObjectNotFoundError("sumiu"); },
  });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.status, 404);
});

test("Range inválido (além do tamanho do arquivo): 416 com Content-Range bytes */total", async () => {
  const deps = baseDeps({
    getObjectRange: async () => { throw new EditionRangeNotSatisfiableError(1000); },
  });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: "bytes=9999999-", download: false },
    deps,
  );
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("Content-Range"), "bytes */1000");
});

test("falha genérica do R2 (bucket indisponível): 502", async () => {
  const deps = baseDeps({
    getObjectRange: async () => { throw new Error("ECONNRESET"); },
  });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  assert.equal(response.status, 502);
});

test("respostas de erro nunca incluem a chave R2 nem credenciais no corpo", async () => {
  const deps = baseDeps({
    lookupEdition: async () => ({ ...EDITION_776 }),
    getObjectRange: async () => { throw new Error("ECONNRESET: endpoint=https://secret.r2.cloudflarestorage.com key=abc"); },
  });
  const response = await handleEditionAssetRequest(
    { id: VALID_ID, kind: "pdf", method: "GET", rangeHeader: null, download: false },
    deps,
  );
  const body = await response.text();
  assert.doesNotMatch(body, /r2\.cloudflarestorage\.com/);
  assert.doesNotMatch(body, /acervo\/edicoes/);
  assert.doesNotMatch(body, /ACCESS_KEY|SECRET/);
});
