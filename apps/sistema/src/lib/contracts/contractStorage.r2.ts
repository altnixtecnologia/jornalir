import "server-only";

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

/** Contract evidence must never use the public editorial/media R2 bucket. */
function settings(): { client: S3Client; bucket: string } {
  const endpoint = process.env.R2_ENDPOINT;
  const keyId = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_CONTRACTS_BUCKET;
  if (!endpoint || !keyId || !secret || !bucket) {
    throw new Error("Armazenamento privado de contratos não configurado.");
  }
  return {
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId: keyId, secretAccessKey: secret },
    }),
    bucket,
  };
}

export function isPrivateContractStorageConfigured(): boolean {
  return Boolean(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY && process.env.R2_CONTRACTS_BUCKET);
}

/** Only keys for a particular master client and document can ever be read by their route. */
export function contractObjectPrefix(clientId: string, documentId: string): string {
  return `contracts/${clientId}/${documentId}/`;
}
export function isContractObjectKeyFor(key: string, clientId: string, documentId: string): boolean {
  return key.startsWith(contractObjectPrefix(clientId, documentId)) &&
    !key.includes("..") && !key.includes("//");
}

export async function getPrivateContractPdf(key: string, clientId: string, documentId: string): Promise<Uint8Array> {
  if (!isContractObjectKeyFor(key, clientId, documentId)) throw new Error("Caminho privado inválido.");
  const { bucket, client } = settings();
  const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!resp.Body) throw new Error("Documento indisponível no armazenamento.");
  const data = await resp.Body.transformToByteArray();
  if (data.length > 12 * 1024 * 1024) throw new Error("Arquivo ultrapassa o limite.");
  return data;
}

/** This writer will be used only after the signing engine is certified. */
export async function storePrivateContractObject(input: {
  clientId: string; documentId: string;
  kind: "original" | "signed" | "evidence";
  content: Uint8Array;
  contentType: "application/pdf" | "application/json";
}): Promise<{ key: string; sha256: string }> {
  if (input.content.length === 0 || input.content.length > 12 * 1024 * 1024) {
    throw new Error("Arquivo de contrato vazio ou acima de 12 MB.");
  }
  if (input.kind === "evidence" ? input.contentType !== "application/json" : input.contentType !== "application/pdf") {
    throw new Error("Tipo de arquivo incorreto.");
  }
  const key = contractObjectPrefix(input.clientId, input.documentId) +
    input.kind + (input.kind === "evidence" ? ".json" : ".pdf");
  const sha256 = createHash("sha256").update(input.content).digest("hex");
  const { client, bucket } = settings();
  // Collision is prevented by the caller checking the document's stage, and by a random UUID
  // per document. The same object path must never be written after the document is signed.
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).catch((error: unknown) => {
    // Treat only verified "not found" as an available key; fail closed for network/auth errors.
    const code = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    if (code === "NotFound" || code === "NoSuchKey") return null;
    throw error;
  });
  if (head) throw new Error("Este arquivo já existe. Crie nova revisão, sem sobrescrever a evidência.");
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: input.content, ContentType: input.contentType,
    CacheControl: "private, no-store", Metadata: { sha256 },
  }));
  return { key, sha256 };
}
