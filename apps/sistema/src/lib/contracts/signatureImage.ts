import { createHash } from "node:crypto";

/**
 * Assinatura em PNG (representação GRÁFICA) — validação rigorosa e
 * armazenamento versionado por hash. O PNG nunca é prova de autoria: a
 * assinatura eletrônica exige confirmação explícita (Etapa 3). Aqui só se
 * garante que o arquivo é um PNG íntegro, pequeno e estático.
 *
 * Não confiar no `Content-Type` nem na extensão enviados pelo navegador:
 * os bytes são inspecionados (assinatura PNG, chunks, CRC, IEND).
 */

export const SIGNATURE_BUCKET = "signature-images";
export const MAX_SIGNATURE_PNG_BYTES = 512 * 1024;
export const MAX_SIGNATURE_DIMENSION = 2000;
const MAX_SIGNATURE_PIXELS = 3_000_000;
const MAX_CHUNKS = 200;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type SignatureImageInspection =
  | { ok: true; width: number; height: number; sizeBytes: number; sha256: string }
  | { ok: false; error: string };

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

export function inspectSignaturePng(input: Uint8Array): SignatureImageInspection {
  const bytes = input;
  if (bytes.length === 0) return { ok: false, error: "Arquivo vazio." };
  if (bytes.length > MAX_SIGNATURE_PNG_BYTES) {
    return { ok: false, error: "A imagem da assinatura deve ter no máximo 512 KB." };
  }
  if (bytes.length < 8 + 25 + 12 || PNG_MAGIC.some((value, index) => bytes[index] !== value)) {
    return { ok: false, error: "O arquivo não é um PNG válido. Envie uma imagem PNG." };
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let sawIhdr = false;
  let sawIdat = false;
  let sawIend = false;
  let chunks = 0;

  while (offset + 12 <= bytes.length) {
    chunks += 1;
    if (chunks > MAX_CHUNKS) return { ok: false, error: "PNG com estrutura inválida." };
    const length = readUint32(bytes, offset);
    const type = chunkType(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) return { ok: false, error: "PNG truncado ou corrompido." };

    const expectedCrc = readUint32(bytes, dataEnd);
    const actualCrc = crc32(bytes.subarray(offset + 4, dataEnd));
    if (expectedCrc !== actualCrc) return { ok: false, error: "PNG corrompido (verificação de integridade falhou)." };

    if (chunks === 1) {
      if (type !== "IHDR" || length !== 13) return { ok: false, error: "PNG com cabeçalho inválido." };
      width = readUint32(bytes, dataStart);
      height = readUint32(bytes, dataStart + 4);
      sawIhdr = true;
    } else if (type === "IHDR") {
      return { ok: false, error: "PNG com estrutura inválida." };
    }
    // Imagem animada (APNG) não é aceita: assinatura precisa ser estática.
    if (type === "acTL" || type === "fcTL" || type === "fdAT") {
      return { ok: false, error: "PNG animado não é aceito. Envie uma imagem estática." };
    }
    if (type === "IDAT") sawIdat = true;
    if (type === "IEND") {
      sawIend = true;
      offset = dataEnd + 4;
      break;
    }
    offset = dataEnd + 4;
  }

  if (!sawIhdr || !sawIdat || !sawIend) return { ok: false, error: "PNG incompleto ou corrompido." };
  if (offset !== bytes.length) return { ok: false, error: "O arquivo contém dados após o fim do PNG." };
  if (width < 1 || height < 1) return { ok: false, error: "PNG com dimensões inválidas." };
  if (width > MAX_SIGNATURE_DIMENSION || height > MAX_SIGNATURE_DIMENSION || width * height > MAX_SIGNATURE_PIXELS) {
    return { ok: false, error: `A imagem é grande demais (máximo ${MAX_SIGNATURE_DIMENSION}×${MAX_SIGNATURE_DIMENSION} pixels).` };
  }

  return { ok: true, width, height, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export type SignatureOwnerKind = "profile" | "representative";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Caminho versionado por hash (conteúdo endereçado): um PNG diferente nunca sobrescreve o anterior. */
export function signatureStoragePath(kind: SignatureOwnerKind, ownerId: string, sha256: string): string {
  if (!UUID_RE.test(ownerId)) throw new Error("Identificador inválido para a assinatura.");
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("Hash inválido para a assinatura.");
  return `${kind === "profile" ? "profiles" : "representatives"}/${ownerId.toLowerCase()}/${sha256}.png`;
}

export interface SignatureImageStoreDeps {
  /** Grava sem sobrescrever. `exists` = mesmo caminho (mesmo hash → mesmo conteúdo). Lança em erro real. */
  upload: (path: string, bytes: Uint8Array) => Promise<"created" | "exists">;
  persist: (meta: { path: string; sha256: string; sizeBytes: number; width: number; height: number }) => Promise<void>;
}

export type StoreSignatureResult =
  | { ok: true; path: string; sha256: string; sizeBytes: number; width: number; height: number; reused: boolean }
  | { ok: false; error: string };

/** Valida → grava no bucket privado (sem sobrescrever) → registra no banco. Repetível: mesmo PNG = mesmo caminho, sem duplicar. */
export async function storeSignatureImage(
  input: { kind: SignatureOwnerKind; ownerId: string; bytes: Uint8Array },
  deps: SignatureImageStoreDeps,
): Promise<StoreSignatureResult> {
  const inspected = inspectSignaturePng(input.bytes);
  if (!inspected.ok) return inspected;
  const path = signatureStoragePath(input.kind, input.ownerId, inspected.sha256);
  let uploaded: "created" | "exists";
  try {
    uploaded = await deps.upload(path, input.bytes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível armazenar a imagem." };
  }
  try {
    await deps.persist({
      path,
      sha256: inspected.sha256,
      sizeBytes: inspected.sizeBytes,
      width: inspected.width,
      height: inspected.height,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível registrar a assinatura." };
  }
  return {
    ok: true,
    path,
    sha256: inspected.sha256,
    sizeBytes: inspected.sizeBytes,
    width: inspected.width,
    height: inspected.height,
    reused: uploaded === "exists",
  };
}
