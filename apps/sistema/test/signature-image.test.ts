import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import {
  inspectSignaturePng,
  MAX_SIGNATURE_PNG_BYTES,
  signatureStoragePath,
  storeSignatureImage,
  type SignatureImageStoreDeps,
} from "../src/lib/contracts/signatureImage";

// Etapa 1 (08/11/2026): o PNG de assinatura é só representação gráfica. Os
// bytes são inspecionados — nunca o Content-Type/extensão que o navegador diz.

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function makePng(width = 40, height = 20, extra: Buffer[] = []): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 255)]);
  const raw = Buffer.concat(Array.from({ length: Math.min(height, 40) }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...extra,
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const OWNER = "11111111-2222-4333-8444-555555555555";

test("PNG válido é aceito, com dimensões, tamanho e sha256", () => {
  const png = makePng(40, 20);
  const result = inspectSignaturePng(png);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.width, 40);
    assert.equal(result.height, 20);
    assert.equal(result.sizeBytes, png.length);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
  }
});

test("rejeita arquivo vazio, JPEG renomeado, texto e PDF — pelo CONTEÚDO, não pela extensão", () => {
  assert.equal(inspectSignaturePng(new Uint8Array()).ok, false);
  assert.equal(inspectSignaturePng(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(1)])).ok, false);
  assert.equal(inspectSignaturePng(Buffer.from("%PDF-1.7 não sou imagem ".repeat(10))).ok, false);
  assert.equal(inspectSignaturePng(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>".repeat(3))).ok, false);
});

test("rejeita PNG truncado, com CRC adulterado ou com bytes após o IEND", () => {
  const png = makePng();
  assert.equal(inspectSignaturePng(png.subarray(0, png.length - 20)).ok, false);
  const tampered = Buffer.from(png);
  tampered[tampered.length - 20] ^= 0xff; // corrompe o IDAT
  const bad = inspectSignaturePng(tampered);
  assert.equal(bad.ok, false);
  const trailing = inspectSignaturePng(Buffer.concat([png, Buffer.from("<?php evil ?>")]));
  assert.equal(trailing.ok, false);
});

test("rejeita PNG animado (APNG) e PNG sem IDAT", () => {
  const actl = chunk("acTL", Buffer.alloc(8));
  const apng = inspectSignaturePng(makePng(40, 20, [actl]));
  assert.equal(apng.ok, false);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(10, 0);
  ihdr.writeUInt32BE(10, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const noData = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  assert.equal(inspectSignaturePng(noData).ok, false);
});

test("rejeita imagem enorme em pixels ou em bytes (limite de 512 KB)", () => {
  assert.equal(inspectSignaturePng(makePng(2500, 100)).ok, false);
  assert.equal(inspectSignaturePng(makePng(2000, 2000)).ok, false);
  const huge = Buffer.concat([makePng(), Buffer.alloc(MAX_SIGNATURE_PNG_BYTES)]);
  const result = inspectSignaturePng(huge);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /512 KB/);
});

test("caminho de armazenamento é versionado por hash e separa perfil de representante; ids inválidos são recusados", () => {
  const sha = "a".repeat(64);
  assert.equal(signatureStoragePath("profile", OWNER, sha), `profiles/${OWNER}/${sha}.png`);
  assert.equal(signatureStoragePath("representative", OWNER, sha), `representatives/${OWNER}/${sha}.png`);
  assert.throws(() => signatureStoragePath("profile", "../../etc/passwd", sha));
  assert.throws(() => signatureStoragePath("profile", OWNER, "nao-e-hash"));
  assert.throws(() => signatureStoragePath("profile", OWNER, "A".repeat(64)));
});

function fakeDeps(overrides: Partial<SignatureImageStoreDeps> = {}) {
  const calls = { uploads: [] as string[], persisted: [] as string[] };
  const deps: SignatureImageStoreDeps = {
    upload: async (path) => {
      calls.uploads.push(path);
      return "created";
    },
    persist: async (meta) => {
      calls.persisted.push(meta.path);
    },
    ...overrides,
  };
  return { deps, calls };
}

test("storeSignatureImage: PNG inválido não toca no storage nem no banco", async () => {
  const { deps, calls } = fakeDeps();
  const result = await storeSignatureImage({ kind: "profile", ownerId: OWNER, bytes: Buffer.from("não é png") }, deps);
  assert.equal(result.ok, false);
  assert.deepEqual(calls, { uploads: [], persisted: [] });
});

test("storeSignatureImage: grava no caminho do hash e registra; repetir o mesmo PNG reaproveita (sem duplicar nem sobrescrever)", async () => {
  const png = makePng(30, 10);
  const { deps, calls } = fakeDeps({
    upload: async (path) => (calls0.uploads.includes(path) ? "exists" : (calls0.uploads.push(path), "created")),
  });
  const calls0 = { uploads: [] as string[] };
  const first = await storeSignatureImage({ kind: "representative", ownerId: OWNER, bytes: png }, deps);
  const second = await storeSignatureImage({ kind: "representative", ownerId: OWNER, bytes: png }, deps);
  assert.equal(first.ok && !first.reused, true);
  assert.equal(second.ok && second.reused, true);
  assert.equal(calls0.uploads.length, 1);
  assert.equal(calls.persisted.length, 2);
  assert.ok(first.ok && first.path.startsWith(`representatives/${OWNER}/`));
});

test("storeSignatureImage: PNG diferente => caminho diferente (nunca sobrescreve a versão anterior)", async () => {
  const { deps } = fakeDeps();
  const a = await storeSignatureImage({ kind: "profile", ownerId: OWNER, bytes: makePng(30, 10) }, deps);
  const b = await storeSignatureImage({ kind: "profile", ownerId: OWNER, bytes: makePng(31, 10) }, deps);
  assert.ok(a.ok && b.ok && a.path !== b.path);
});

test("storeSignatureImage: falha no upload não registra no banco; falha no registro devolve erro", async () => {
  const png = makePng();
  const failingUpload = fakeDeps({ upload: async () => { throw new Error("storage fora do ar"); } });
  const r1 = await storeSignatureImage({ kind: "profile", ownerId: OWNER, bytes: png }, failingUpload.deps);
  assert.equal(r1.ok, false);
  assert.deepEqual(failingUpload.calls.persisted, []);
  const failingPersist = fakeDeps({ persist: async () => { throw new Error("banco indisponível"); } });
  const r2 = await storeSignatureImage({ kind: "profile", ownerId: OWNER, bytes: png }, failingPersist.deps);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.error, /banco indisponível/);
});
