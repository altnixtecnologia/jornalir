import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const MAX_EDITION_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_EDITION_COVER_BYTES = 3 * 1024 * 1024;

export class InvalidEditionArchiveUploadError extends Error {}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requiredEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function r2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

function bucket(): string {
  // No início usaremos o mesmo bucket R2 já operacional para mídias,
  // isolando as edições pelo prefixo jornal-online/. Se no futuro o acervo
  // merecer bucket próprio, basta definir R2_EDITIONS_BUCKET sem mudar código.
  return env("R2_EDITIONS_BUCKET") ?? requiredEnv("R2_BUCKET");
}

function publicBase(): string {
  return (env("R2_EDITIONS_PUBLIC_BASE_URL") ?? requiredEnv("R2_PUBLIC_BASE_URL")).replace(/\/$/, "");
}

export function isEditionR2ArchiveConfigured(): boolean {
  return Boolean(
    env("R2_ENDPOINT") &&
      env("R2_ACCESS_KEY_ID") &&
      env("R2_SECRET_ACCESS_KEY") &&
      (env("R2_EDITIONS_BUCKET") || env("R2_BUCKET")) &&
      (env("R2_EDITIONS_PUBLIC_BASE_URL") || env("R2_PUBLIC_BASE_URL")),
  );
}

export async function ensureEditionR2CorsConfigured(): Promise<void> {
  const client = r2Client();
  const corsRuleId = "jornal-online-browser";
  const extraOrigins = (env("R2_EDITIONS_CORS_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = Array.from(
    new Set([
      "https://controle.altnix.com.br",
      "https://jornalir-sistema.vercel.app",
      "https://jornalir.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
      ...extraOrigins,
    ]),
  );

  let existing: Awaited<ReturnType<S3Client["send"]>> | null = null;
  try {
    existing = await client.send(new GetBucketCorsCommand({ Bucket: bucket() }));
  } catch {
    // Bucket sem configuração CORS ainda.
  }

  const previousRules =
    existing && "CORSRules" in existing && Array.isArray(existing.CORSRules)
      ? existing.CORSRules
      : [];

  const keptRules = previousRules.filter((rule) => rule.ID !== corsRuleId);
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket(),
      CORSConfiguration: {
        CORSRules: [
          ...keptRules,
          {
            ID: corsRuleId,
            AllowedOrigins: origins,
            AllowedMethods: ["GET", "HEAD", "PUT"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["Accept-Ranges", "Content-Length", "Content-Range", "ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}

function safeFileBase(name: string): string {
  const base = name
    .replace(/\.pdf$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return base || "informativo-regional";
}

function archivePrefix(editionNumber: number, publicationDate: string): string {
  const year = /^\d{4}-/.test(publicationDate) ? publicationDate.slice(0, 4) : "sem-ano";
  return `jornal-online/${year}/edicao-${String(editionNumber).padStart(4, "0")}`;
}

function publicUrl(key: string): string {
  return `${publicBase()}/${key}`;
}

export function getEditionArchivePublicUrl(key: string): string {
  return publicUrl(key);
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeKeyPath(key: string): string {
  return "/" + key.split("/").map(rfc3986).join("/");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/**
 * URL PUT pré-assinada para o domínio S3 do R2.
 * Implementa AWS Signature V4 diretamente para não adicionar uma dependência
 * só para a assinatura. O navegador recebe apenas a URL temporária; nunca as
 * credenciais R2.
 */
function presignPutUrl(key: string, expiresSeconds = 900): string {
  const endpoint = new URL(requiredEnv("R2_ENDPOINT"));
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
  const region = "auto";
  const service = "s3";
  const host = `${bucket()}.${endpoint.host}`;
  const canonicalUri = encodeKeyPath(key);
  const { amzDate, dateStamp } = formatAmzDate(new Date());
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };

  const canonicalQuery = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([keyName, value]) => `${rfc3986(keyName)}=${rfc3986(value)}`)
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return `${endpoint.protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export interface EditionDirectUploadPlan {
  pdf: { key: string; uploadUrl: string; publicUrl: string };
  cover: { key: string; uploadUrl: string; publicUrl: string };
  expiresAt: string;
}

export function createEditionDirectUploadPlan(
  fileName: string,
  options: EditionArchiveUploadOptions,
): EditionDirectUploadPlan {
  const cleanName = `${safeFileBase(fileName)}.pdf`;
  const prefix = archivePrefix(options.editionNumber, options.publicationDate);
  const uploadId = randomUUID();
  const pdfKey = `${prefix}/${uploadId}-${cleanName}`;
  const coverKey = `${prefix}/capa-${uploadId}.webp`;

  return {
    pdf: {
      key: pdfKey,
      uploadUrl: presignPutUrl(pdfKey),
      publicUrl: publicUrl(pdfKey),
    },
    cover: {
      key: coverKey,
      uploadUrl: presignPutUrl(coverKey),
      publicUrl: publicUrl(coverKey),
    },
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}

export function isEditionArchiveKeyFor(
  key: string,
  options: EditionArchiveUploadOptions,
): boolean {
  return key.startsWith(`${archivePrefix(options.editionNumber, options.publicationDate)}/`);
}

export async function validateEditionPdfObject(
  key: string,
  expectedSize: number,
): Promise<void> {
  const client = r2Client();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  if (Number(head.ContentLength ?? 0) !== expectedSize) {
    throw new Error("O PDF chegou ao R2 com tamanho diferente do arquivo selecionado.");
  }
  const firstBytes = await client.send(
    new GetObjectCommand({ Bucket: bucket(), Key: key, Range: "bytes=0-4" }),
  );
  const signature = firstBytes.Body ? Buffer.from(await firstBytes.Body.transformToByteArray()).toString("ascii") : "";
  if (signature !== "%PDF-") {
    throw new Error("O objeto enviado ao R2 não possui assinatura de PDF válida.");
  }
}

export async function validateEditionCoverObject(key: string): Promise<void> {
  const head = await r2Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  const size = Number(head.ContentLength ?? 0);
  if (size <= 0 || size > MAX_EDITION_COVER_BYTES) {
    throw new Error("A capa enviada ao R2 está vazia ou acima do limite permitido.");
  }
}

export interface EditionArchiveUploadOptions {
  editionNumber: number;
  publicationDate: string;
}

export interface EditionPdfR2Upload {
  key: string;
  publicUrl: string;
  fileName: string;
  fileSize: number;
  sha256: string;
}

/**
 * Provider de arquivo oficial da edição.
 *
 * IMPORTANTE: esta função é útil para migração/scripts e processamento
 * servidor-servidor. O upload em produção pelo navegador NÃO deve mandar o
 * PDF através de uma Vercel Function (limite de payload); o fluxo público de
 * upload será browser -> URL pré-assinada do R2 -> finalização no sistema.
 */
export async function uploadEditionPdfToR2(
  file: File,
  options: EditionArchiveUploadOptions,
): Promise<EditionPdfR2Upload> {
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) throw new InvalidEditionArchiveUploadError("Envie um arquivo PDF.");
  if (file.size <= 0 || file.size > MAX_EDITION_PDF_BYTES) {
    throw new InvalidEditionArchiveUploadError(
      `PDF inválido ou acima do limite atual de ${MAX_EDITION_PDF_BYTES / 1024 / 1024} MB.`,
    );
  }

  const body = Buffer.from(await file.arrayBuffer());
  if (body.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new InvalidEditionArchiveUploadError("A assinatura binária do arquivo não corresponde a um PDF válido.");
  }

  const sha256 = createHash("sha256").update(body).digest("hex");
  const cleanName = `${safeFileBase(file.name)}.pdf`;
  const prefix = archivePrefix(options.editionNumber, options.publicationDate);
  const key = `${prefix}/${sha256.slice(0, 20)}-${cleanName}`;

  const client = r2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: "application/pdf",
      ContentDisposition: `inline; filename="${cleanName}"`,
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: {
        edition: String(options.editionNumber),
        publicationDate: options.publicationDate,
        sha256,
      },
    }),
  );

  const head = await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  if (Number(head.ContentLength ?? 0) !== body.length) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch(() => undefined);
    throw new Error("O PDF foi enviado ao R2, mas a validação de tamanho falhou.");
  }

  return {
    key,
    publicUrl: publicUrl(key),
    fileName: cleanName,
    fileSize: body.length,
    sha256,
  };
}

export interface EditionCoverR2Upload {
  key: string;
  publicUrl: string;
}

/**
 * Recebe a miniatura já renderizada da página 1. A renderização será feita
 * no navegador durante o upload com PDF.js; assim não dependemos de Poppler/
 * Ghostscript no runtime da Vercel.
 */
export async function uploadEditionCoverToR2(
  cover: File,
  options: EditionArchiveUploadOptions,
): Promise<EditionCoverR2Upload> {
  if (!["image/webp", "image/jpeg", "image/png"].includes(cover.type)) {
    throw new InvalidEditionArchiveUploadError("Capa inválida. Use WebP, JPEG ou PNG.");
  }
  if (cover.size <= 0 || cover.size > MAX_EDITION_COVER_BYTES) {
    throw new InvalidEditionArchiveUploadError("Capa vazia ou muito grande.");
  }

  const ext = cover.type === "image/webp" ? "webp" : cover.type === "image/png" ? "png" : "jpg";
  const body = Buffer.from(await cover.arrayBuffer());
  const sha256 = createHash("sha256").update(body).digest("hex");
  const prefix = archivePrefix(options.editionNumber, options.publicationDate);
  const key = `${prefix}/capa-${sha256.slice(0, 16)}.${ext}`;

  const client = r2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: cover.type,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return { key, publicUrl: publicUrl(key) };
}

export async function getEditionPdfFromR2(key: string): Promise<Uint8Array> {
  const result = await r2Client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new Error("PDF não encontrado no R2.");
  return result.Body.transformToByteArray();
}

export async function deleteEditionArchiveObject(key: string): Promise<void> {
  await r2Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
