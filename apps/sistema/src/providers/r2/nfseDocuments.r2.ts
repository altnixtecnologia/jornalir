import "server-only";
import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Kind = "nfse_xml" | "dps_xml" | "danfse_pdf" | "cancellation_xml" | "cancellation_response_xml";
const MAX_BYTES = 8 * 1024 * 1024;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`R2 fiscal não configurado: ${name}`);
  return value;
}
function config(): { bucket: string; client: S3Client } {
  return {
    bucket: required("R2_NFSE_BUCKET"),
    client: new S3Client({
      region: "auto",
      endpoint: required("R2_NFSE_ENDPOINT"),
      credentials: {
        accessKeyId: required("R2_NFSE_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_NFSE_SECRET_ACCESS_KEY"),
      },
    }),
  };
}
export function isNfseR2Configured(): boolean {
  return ["R2_NFSE_BUCKET","R2_NFSE_ENDPOINT","R2_NFSE_ACCESS_KEY_ID","R2_NFSE_SECRET_ACCESS_KEY"]
    .every((name) => Boolean(process.env[name]?.trim()));
}
export function nfseObjectKey(input: { noteId: string; environment: "homologation"|"production"; kind: Kind; sha256: string }): string {
  if (!/^[0-9a-f-]{36}$/i.test(input.noteId) || !/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error("Identificador de arquivo fiscal inválido");
  const ext = input.kind === "danfse_pdf" ? "pdf" : "xml";
  return `nfse/${input.environment}/${input.noteId}/${input.kind}-${input.sha256}.${ext}`;
}
export async function saveNfseDocument(input: {
  noteId: string; environment: "homologation"|"production"; kind: Kind; data: Buffer;
}): Promise<{ key: string; sha256: string; sizeBytes: number; contentType: string }> {
  if (!input.data.length || input.data.length > MAX_BYTES) throw new Error("Arquivo fiscal vazio ou grande demais");
  const sha256 = createHash("sha256").update(input.data).digest("hex");
  const key = nfseObjectKey({ noteId: input.noteId, environment: input.environment, kind: input.kind, sha256 });
  const contentType = input.kind === "danfse_pdf" ? "application/pdf" : "application/xml";
  const { bucket, client } = config();
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: input.data,
      ContentType: contentType,
      Metadata: { sha256 },
    }));
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (Number(head.ContentLength) !== input.data.length || head.Metadata?.sha256 !== sha256) {
      throw new Error("Documento R2 não conferiu com o SHA-256 esperado");
    }
    return { key, sha256, sizeBytes: input.data.length, contentType };
  } finally {
    client.destroy();
  }
}
export async function readNfseDocument(key: string, sha256: string): Promise<Buffer> {
  if (!/^nfse\/(homologation|production)\/[0-9a-f-]{36}\/(nfse_xml|dps_xml|danfse_pdf|cancellation_xml|cancellation_response_xml)-[a-f0-9]{64}\.(xml|pdf)$/.test(key)) {
    throw new Error("Caminho do documento fiscal inválido");
  }
  const { bucket, client } = config();
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) throw new Error("Arquivo fiscal não encontrado no R2");
    const bytes = Buffer.from(await response.Body.transformToByteArray());
    if (bytes.length > MAX_BYTES || createHash("sha256").update(bytes).digest("hex") !== sha256) {
      throw new Error("Integridade SHA-256 do arquivo fiscal não confirmada");
    }
    return bytes;
  } finally {
    client.destroy();
  }
}
