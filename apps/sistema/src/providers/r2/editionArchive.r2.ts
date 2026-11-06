import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { CORSRule } from "@aws-sdk/client-s3";
import { parseEditionArchiveObjectKey } from "./editionsArchiveImportPlan";
import { findAcervoObjectForEdition } from "./editionArchiveRecognition";

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

/** Edições podem usar bucket/credenciais próprios. Nunca misturar chaves:
 * as chaves antigas de fotos podem ter escopo limitado ao bucket R2_BUCKET.
 * Exigir configurações exclusivas para um bucket de edições diferente.
 */
function hasDedicatedEditionBucket(): boolean {
  const editions = env("R2_EDITIONS_BUCKET");
  return Boolean(editions && editions !== env("R2_BUCKET"));
}

function editionCredentials(): { accessKeyId: string; secretAccessKey: string } {
  if (hasDedicatedEditionBucket()) {
    return {
      accessKeyId: requiredEnv("R2_EDITIONS_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_EDITIONS_SECRET_ACCESS_KEY"),
    };
  }
  // Compatibilidade: edição no mesmo bucket de mídias usa chaves existentes.
  return {
    accessKeyId: env("R2_EDITIONS_ACCESS_KEY_ID") ?? requiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_EDITIONS_SECRET_ACCESS_KEY") ?? requiredEnv("R2_SECRET_ACCESS_KEY"),
  };
}

/** Bucket exclusivo pode viver em outra conta Cloudflare: exige o endpoint
 * próprio (R2_EDITIONS_ENDPOINT), nunca reaproveita silenciosamente o
 * endpoint do bucket de mídias. */
function editionEndpoint(): string {
  if (hasDedicatedEditionBucket()) {
    return requiredEnv("R2_EDITIONS_ENDPOINT");
  }
  return env("R2_EDITIONS_ENDPOINT") ?? requiredEnv("R2_ENDPOINT");
}

function r2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: editionEndpoint(),
    credentials: editionCredentials(),
  });
}

function bucket(): string {
  return env("R2_EDITIONS_BUCKET") ?? requiredEnv("R2_BUCKET");
}

function publicBase(): string {
  // A URL pública do bucket de fotos nunca pode representar o bucket novo.
  const base = hasDedicatedEditionBucket()
    ? requiredEnv("R2_EDITIONS_PUBLIC_BASE_URL")
    : env("R2_EDITIONS_PUBLIC_BASE_URL") ?? requiredEnv("R2_PUBLIC_BASE_URL");
  return base.replace(/\/$/, "");
}

/**
 * Endpoint + bucket + credenciais — o mínimo para QUALQUER operação no
 * bucket de edições, leitura OU escrita (upload, reaproveitamento do
 * acervo, HEAD, listagem). Nunca exige URL pública: desde a decisão de
 * manter o bucket privado e entregar PDFs/capas só pelas rotas de proxy
 * do portal (`apps/site`, ver docs/JORNAL-ONLINE-ARMAZENAMENTO-E-LEITOR.md),
 * `R2_EDITIONS_PUBLIC_BASE_URL` nunca precisa existir — exigi-la aqui
 * bloquearia upload/reaproveitamento em qualquer ambiente sem esse domínio
 * configurado, mesmo que a entrega pública real não dependa dele.
 */
export function isEditionR2ReadConfigured(): boolean {
  try {
    editionEndpoint();
    bucket();
    editionCredentials();
    return true;
  } catch {
    return false;
  }
}

/**
 * Só exige URL pública ADEMAIS do mínimo acima — usada apenas por quem
 * efetivamente precisa de um link direto e público ao objeto (hoje,
 * nenhum caminho crítico do painel precisa: upload/reaproveitamento usam
 * `isEditionR2ReadConfigured`, e `getEditionArchivePublicUrl` já devolve
 * `null` sem quebrar nada quando essa URL não existe).
 */
export function isEditionR2ArchiveConfigured(): boolean {
  try {
    editionEndpoint();
    bucket();
    editionCredentials();
    publicBase();
    return true;
  } catch {
    return false;
  }
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

  let previousRules: CORSRule[] = [];

  try {
    const existing = await client.send(new GetBucketCorsCommand({ Bucket: bucket() }));
    previousRules = existing.CORSRules ?? [];
  } catch {
    // Bucket sem configuração CORS ainda.
  }

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

/** `null` quando `R2_EDITIONS_PUBLIC_BASE_URL` não está configurada — o
 * bucket é privado de propósito, então a ausência de URL pública nunca é
 * um erro, só significa "sem link direto". Quem grava em `pdf_url`/
 * `cover_url` no Supabase já trata `null` normalmente (coluna aceita
 * nulo); a entrega real ao navegador usa as rotas de proxy, nunca este
 * link. */
function publicUrlOrNull(key: string): string | null {
  try {
    return publicUrl(key);
  } catch {
    return null;
  }
}

export function getEditionArchivePublicUrl(key: string): string | null {
  return publicUrlOrNull(key);
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
  const endpoint = new URL(editionEndpoint());
  const { accessKeyId, secretAccessKey } = editionCredentials();
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
  pdf: { key: string; uploadUrl: string; publicUrl: string | null };
  cover: { key: string; uploadUrl: string; publicUrl: string | null };
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
      publicUrl: publicUrlOrNull(pdfKey),
    },
    cover: {
      key: coverKey,
      uploadUrl: presignPutUrl(coverKey),
      publicUrl: publicUrlOrNull(coverKey),
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
  publicUrl: string | null;
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

  return { key, publicUrl: publicUrlOrNull(key) };
}

export async function getEditionPdfFromR2(key: string): Promise<Uint8Array> {
  const result = await r2Client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new Error("PDF não encontrado no R2.");
  return result.Body.transformToByteArray();
}

export async function deleteEditionArchiveObject(key: string): Promise<void> {
  await r2Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/**
 * Procura, no acervo histórico já importado (`acervo/edicoes/IR NNN.pdf`),
 * o PDF que corresponde a esta edição — somente leitura (lista + HEAD
 * implícito via tamanho já retornado pela listagem). Usada para reaproveitar
 * um PDF que já está no R2 sem exigir novo upload pelo navegador.
 */
export async function findAcervoEditionArchiveObject(
  editionNumber: number,
): Promise<EditionArchiveObjectSummary | null> {
  const objects = await listEditionArchiveObjects("acervo/edicoes/");
  return findAcervoObjectForEdition(objects, editionNumber, parseEditionArchiveObjectKey);
}

/** SHA-256 completo de um objeto já existente no R2 — nunca confia em
 * ETag/tamanho isolados para provar identidade de conteúdo. */
export async function sha256OfEditionArchiveObject(key: string): Promise<string> {
  const bytes = await getEditionPdfFromR2(key);
  return createHash("sha256").update(bytes).digest("hex");
}

/** Mesma convenção de chave de `uploadEditionCoverToR2`, mas a partir de um
 * buffer já renderizado em memória (reaproveitamento do acervo, sem passar
 * por `File`/upload do navegador). */
export function editionCoverBufferKey(buffer: Buffer, options: EditionArchiveUploadOptions): string {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  return `${archivePrefix(options.editionNumber, options.publicationDate)}/capa-${sha256.slice(0, 16)}.webp`;
}

export async function uploadEditionCoverBufferToR2(
  buffer: Buffer,
  options: EditionArchiveUploadOptions,
): Promise<EditionCoverR2Upload> {
  if (buffer.length <= 0 || buffer.length > MAX_EDITION_COVER_BYTES) {
    throw new InvalidEditionArchiveUploadError("Capa vazia ou muito grande.");
  }
  const key = editionCoverBufferKey(buffer, options);

  await r2Client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return { key, publicUrl: publicUrlOrNull(key) };
}

export interface EditionArchiveObjectSummary {
  key: string;
  size: number;
  lastModified: string | null;
  etag: string | null;
}

/**
 * Lista objetos do bucket de edições (somente leitura — nenhum PUT/DELETE).
 * Usada pelo importador de metadados do acervo histórico para reconhecer o
 * que já existe no R2 sem reenviar nada. Pagina automaticamente.
 */
export async function listEditionArchiveObjects(prefix?: string): Promise<EditionArchiveObjectSummary[]> {
  const client = r2Client();
  const objects: EditionArchiveObjectSummary[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const item of page.Contents ?? []) {
      if (!item.Key) continue;
      objects.push({
        key: item.Key,
        size: Number(item.Size ?? 0),
        lastModified: item.LastModified ? item.LastModified.toISOString() : null,
        etag: item.ETag ?? null,
      });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}
