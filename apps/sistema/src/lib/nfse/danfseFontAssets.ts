import "server-only";
import { createHash } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Fontes fiscais: NEVER commitar .ttf/.otf da Microsoft, copiar do Windows
 * ao servidor ou expor links públicos. O operador precisa de direito
 * explícito de USO NO SERVIDOR e incorporação em PDF. Microsoft FAQ:
 * https://learn.microsoft.com/en-us/typography/fonts/font-faq
 *
 * Para preview sem fontes licenciadas: retornar undefined. A emissão real
 * permanece travada por DANFSE_OFFICIAL_LAYOUT_APPROVED=false.
 */
export interface DanfseEmbeddedFonts {
  arialBold: Uint8Array;
  microsoftSansSerif: Uint8Array;
}

const MAX_FONT_BYTES = 4 * 1024 * 1024;
const KEY_PREFIX = "nfse/private-fonts/";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Fonte fiscal indisponível: configuração ${name} ausente.`);
  return value;
}

function fontTable(bytes: Buffer, tag: string): { start: number; length: number } | undefined {
  if (bytes.length < 12) return undefined;
  const count = bytes.readUInt16BE(4);
  if (count < 1 || count > 128 || bytes.length < 12 + count * 16) return undefined;
  for (let i = 0; i < count; i++) {
    const offset = 12 + i * 16;
    if (bytes.toString("ascii", offset, offset + 4) !== tag) continue;
    const start = bytes.readUInt32BE(offset + 8);
    const length = bytes.readUInt32BE(offset + 12);
    if (start > bytes.length || length > bytes.length - start) return undefined;
    return { start, length };
  }
  return undefined;
}

function familyAndStyle(bytes: Buffer): { family: string; style: string } {
  const nameTable = fontTable(bytes, "name");
  if (!nameTable || nameTable.length < 6) throw new Error("Fonte fiscal sem tabela OpenType de nomes.");
  const n = nameTable.start;
  const records = bytes.readUInt16BE(n + 2);
  const storage = bytes.readUInt16BE(n + 4);
  if (records < 1 || records > 1024 || 6 + records * 12 > nameTable.length) {
    throw new Error("Tabela de nomes da fonte fiscal inválida.");
  }
  const entries: { id: number; lang: number; value: string }[] = [];
  for (let i = 0; i < records; i++) {
    const off = n + 6 + i * 12;
    const platform = bytes.readUInt16BE(off);
    const lang = bytes.readUInt16BE(off + 4);
    const id = bytes.readUInt16BE(off + 6);
    const len = bytes.readUInt16BE(off + 8);
    const pos = bytes.readUInt16BE(off + 10);
    if (platform !== 3 || (id !== 1 && id !== 2)) continue;
    if ((len & 1) !== 0 || storage + pos + len > nameTable.length) continue;
    const start = n + storage + pos;
    const swapped = Buffer.from(bytes.subarray(start, start + len)).swap16();
    const value = swapped.toString("utf16le").replace(/\0/g, "").trim();
    if (value) entries.push({ id, lang, value });
  }
  const name = (id: number) => entries.find(x => x.id === id && x.lang === 0x0409)?.value
    ?? entries.find(x => x.id === id)?.value ?? "";
  return { family: name(1), style: name(2) };
}

/**
 * Verifica integridade, família real e flags OS/2 de incorporação.
 * O check técnico não substitui a licença de uso no servidor.
 * Rejeita "restricted", "preview & print only" (PDF editável), "no
 * subsetting" e "bitmap only"; os PDFs usam subsetting no fontkit.
 */
export function verifyDanfseFontFile(
  bytes: Uint8Array, expectedSha256: string, kind: "arial-bold" | "microsoft-sans-serif",
): void {
  const b = Buffer.from(bytes);
  if (b.length < 128 || b.length > MAX_FONT_BYTES ||
    (b.readUInt32BE(0) !== 0x00010000 && b.toString("ascii", 0, 4) !== "OTTO")) {
    throw new Error("Fonte fiscal inválida: arquivo TTF/OTF não reconhecido.");
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha256) ||
    createHash("sha256").update(b).digest("hex") !== expectedSha256) {
    throw new Error("Fonte fiscal não corresponde ao SHA-256 configurado.");
  }
  const os2 = fontTable(b, "OS/2");
  if (!os2 || os2.length < 10) throw new Error("Fonte fiscal sem direitos de incorporação verificáveis.");
  const fsType = b.readUInt16BE(os2.start + 8);
  if ((fsType & (0x0002 | 0x0004 | 0x0100 | 0x0200)) !== 0) {
    throw new Error("Fonte fiscal restringe incorporação/edição/subsetting neste PDF.");
  }
  const { family, style } = familyAndStyle(b);
  if (kind === "arial-bold") {
    if (!/^arial$/i.test(family) || !/bold/i.test(style)) {
      throw new Error("Fonte fiscal incorreta: é necessário Arial Bold original.");
    }
  } else if (!/^microsoft sans serif$/i.test(family)) {
    throw new Error("Fonte fiscal incorreta: é necessário Microsoft Sans Serif original.");
  }
}

export async function loadLicensedDanfseFonts(): Promise<DanfseEmbeddedFonts | undefined> {
  const arialKey = process.env.DANFSE_ARIAL_BOLD_R2_KEY?.trim();
  const sansKey = process.env.DANFSE_MICROSOFT_SANS_SERIF_R2_KEY?.trim();
  if (!arialKey && !sansKey) return undefined;
  if (!arialKey || !sansKey || process.env.DANFSE_FONT_SERVER_LICENSE_CONFIRMED !== "true") {
    throw new Error("Fontes DANFSe: configure ambas as famílias e confirme licença para uso no servidor.");
  }
  const validateKey = (key: string) => {
    if (!key.startsWith(KEY_PREFIX) || !/^nfse\/private-fonts\/[a-zA-Z0-9_.-]+\.(ttf|otf)$/.test(key)) {
      throw new Error("Fonte DANFSe fora da pasta privada autorizada.");
    }
  };
  validateKey(arialKey);
  validateKey(sansKey);
  const shaArial = required("DANFSE_ARIAL_BOLD_SHA256").toLowerCase();
  const shaSans = required("DANFSE_MICROSOFT_SANS_SERIF_SHA256").toLowerCase();
  const client = new S3Client({
    region: "auto", endpoint: required("R2_NFSE_ENDPOINT"),
    credentials: {
      accessKeyId: required("R2_NFSE_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_NFSE_SECRET_ACCESS_KEY"),
    },
  });
  try {
    const bucket = required("R2_NFSE_BUCKET");
    const read = async (key: string): Promise<Uint8Array> => {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!response.Body || Number(response.ContentLength || 0) > MAX_FONT_BYTES) {
        throw new Error("Fonte fiscal ausente ou excede o tamanho máximo.");
      }
      const bytes = await response.Body.transformToByteArray();
      if (bytes.length > MAX_FONT_BYTES) throw new Error("Fonte fiscal excede o tamanho máximo.");
      return bytes;
    };
    const [arialBold, microsoftSansSerif] = await Promise.all([read(arialKey), read(sansKey)]);
    verifyDanfseFontFile(arialBold, shaArial, "arial-bold");
    verifyDanfseFontFile(microsoftSansSerif, shaSans, "microsoft-sans-serif");
    return { arialBold, microsoftSansSerif };
  } finally {
    client.destroy();
  }
}
