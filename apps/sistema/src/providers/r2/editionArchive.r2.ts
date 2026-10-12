import "server-only";

import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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
