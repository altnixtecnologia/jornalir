import test from "node:test";
import assert from "node:assert/strict";
import {
  handleEditionPdfProxyRequest,
  type EditionPdfProxyDeps,
} from "../src/lib/editorial/editionPdfProxy";
import {
  EditionArchiveObjectNotFoundError,
  EditionArchiveRangeNotSatisfiableError,
} from "../src/providers/r2/editionArchive.r2";

const VALID_ID = "9f2a3b10-0000-4000-8000-000000000776";

function fakeBodyStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

const EDITION_776 = { archiveProvider: "r2", pdfR2Key: "acervo/edicoes/IR 776.pdf" };

function baseDeps(overrides: Partial<EditionPdfProxyDeps> = {}): EditionPdfProxyDeps {
  return {
    checkPermission: async () => null,
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

test("GET sem Range: 200, application/pdf, Accept-Ranges, ETag", async () => {
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    baseDeps(),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.equal(response.headers.get("Content-Length"), "4");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.equal(response.headers.get("ETag"), '"abc"');
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("GET com Range: 206 e Content-Range repassados, range enviado ao R2", async () => {
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
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: "bytes=0-99" },
    deps,
  );
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 0-99/1000");
});

test("HEAD: 200 sem corpo; nunca chama getObjectRange (não baixa bytes só para checar)", async () => {
  let getObjectRangeCalled = false;
  const deps = baseDeps({
    getObjectRange: async () => {
      getObjectRangeCalled = true;
      throw new Error("não deveria ser chamado em HEAD");
    },
  });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "HEAD", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(getObjectRangeCalled, false);
});

test("sem sessão/permissão editorial: 403, sem consultar Supabase nem R2", async () => {
  let lookupCalled = false;
  const deps = baseDeps({
    checkPermission: async () => "Sessão inválida. Faça login novamente.",
    lookupEdition: async () => { lookupCalled = true; return EDITION_776; },
  });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 403);
  assert.equal(lookupCalled, false);
});

test("id com formato inválido: 404 sem checar permissão nem consultar Supabase", async () => {
  let permissionCalled = false;
  const deps = baseDeps({ checkPermission: async () => { permissionCalled = true; return null; } });
  const response = await handleEditionPdfProxyRequest(
    { editionId: "../../etc/passwd", method: "GET", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 404);
  assert.equal(permissionCalled, false);
});

test("edição inexistente (lookup retorna null): 404", async () => {
  const deps = baseDeps({ lookupEdition: async () => null });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 404);
});

test("edição não é do provedor r2: 404 — esta rota só serve edições com PDF no R2", async () => {
  const deps = baseDeps({ lookupEdition: async () => ({ archiveProvider: "drive", pdfR2Key: undefined }) });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 404);
});

test("edição r2 sem pdfR2Key: 404", async () => {
  const deps = baseDeps({ lookupEdition: async () => ({ archiveProvider: "r2", pdfR2Key: undefined }) });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 404);
});

test("edição INATIVA/rascunho ainda é servida (diferente do portal público) — captura visual trabalha com edições não publicadas", async () => {
  const deps = baseDeps({ lookupEdition: async () => EDITION_776 });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 200);
});

test("R2 não configurado: 503, sem consultar Supabase", async () => {
  let lookupCalled = false;
  const deps = baseDeps({
    isR2Configured: () => false,
    lookupEdition: async () => { lookupCalled = true; return EDITION_776; },
  });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 503);
  assert.equal(lookupCalled, false);
});

test("Supabase indisponível (lookup lança erro): 503", async () => {
  const deps = baseDeps({ lookupEdition: async () => { throw new Error("timeout"); } });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 503);
});

test("objeto ausente no R2: 404", async () => {
  const deps = baseDeps({ getObjectRange: async () => { throw new EditionArchiveObjectNotFoundError("sumiu"); } });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 404);
});

test("Range inválido: 416 com Content-Range bytes */total", async () => {
  const deps = baseDeps({ getObjectRange: async () => { throw new EditionArchiveRangeNotSatisfiableError(1000); } });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: "bytes=9999999-" },
    deps,
  );
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("Content-Range"), "bytes */1000");
});

test("falha genérica do R2: 502", async () => {
  const deps = baseDeps({ getObjectRange: async () => { throw new Error("ECONNRESET"); } });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    deps,
  );
  assert.equal(response.status, 502);
});

test("respostas de erro nunca vazam a chave do R2 nem credenciais", async () => {
  const deps = baseDeps({
    getObjectRange: async () => { throw new Error("ECONNRESET: endpoint=https://secret.r2.cloudflarestorage.com key=abc"); },
  });
  const response = await handleEditionPdfProxyRequest(
    { editionId: VALID_ID, method: "GET", rangeHeader: null },
    deps,
  );
  const body = await response.text();
  assert.doesNotMatch(body, /r2\.cloudflarestorage\.com/);
  assert.doesNotMatch(body, /acervo\/edicoes/);
  assert.doesNotMatch(body, /ACCESS_KEY|SECRET/);
});
