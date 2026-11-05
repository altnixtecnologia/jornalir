import "server-only";

import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Cliente R2 do portal público — SOMENTE LEITURA, exclusivo do bucket de
 * edições (`jornal-ir-edicoes`, segunda conta Cloudflare). Nunca reaproveita
 * credenciais administrativas de escrita; exige suas próprias variáveis
 * `R2_EDITIONS_*` no ambiente do `apps/site` (não herda nada do `apps/sistema`,
 * que roda em outro projeto Vercel). Nenhuma URL pública do R2 é usada aqui —
 * o bucket continua privado; este módulo busca o objeto e devolve os bytes
 * para a própria rota da API do portal entregar pelo domínio do site.
 */

export class EditionsR2NotConfiguredError extends Error {}
export class EditionObjectNotFoundError extends Error {}
export class EditionRangeNotSatisfiableError extends Error {
  constructor(public readonly totalSize: number) {
    super("Intervalo de bytes solicitado não é satisfazível para este objeto.");
  }
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requiredEnv(name: string): string {
  const value = env(name);
  if (!value) throw new EditionsR2NotConfiguredError(`Variável de ambiente ausente: ${name}`);
  return value;
}

function bucket(): string {
  return requiredEnv("R2_EDITIONS_BUCKET");
}

let cachedClient: S3Client | null = null;

function r2Client(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_EDITIONS_ENDPOINT"),
    credentials: {
      accessKeyId: requiredEnv("R2_EDITIONS_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_EDITIONS_SECRET_ACCESS_KEY"),
    },
  });
  return cachedClient;
}

export function isEditionsR2PublicReadConfigured(): boolean {
  try {
    requiredEnv("R2_EDITIONS_ENDPOINT");
    bucket();
    requiredEnv("R2_EDITIONS_ACCESS_KEY_ID");
    requiredEnv("R2_EDITIONS_SECRET_ACCESS_KEY");
    return true;
  } catch {
    return false;
  }
}

export interface EditionObjectHead {
  contentLength: number;
  contentType: string | null;
  etag: string | null;
}

/** HEAD puro — nunca baixa bytes do objeto. */
export async function headEditionObject(key: string): Promise<EditionObjectHead> {
  try {
    const result = await r2Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return {
      contentLength: Number(result.ContentLength ?? 0),
      contentType: result.ContentType ?? null,
      etag: result.ETag ?? null,
    };
  } catch (error) {
    throw mapR2Error(error, key);
  }
}

export interface EditionObjectRangeResult {
  body: ReadableStream<Uint8Array>;
  status: 200 | 206;
  contentLength: number;
  totalSize: number;
  contentRange: string | null;
  contentType: string | null;
  etag: string | null;
}

/**
 * GET com suporte a Range. Devolve um stream (nunca o buffer inteiro em
 * memória) — o corpo retornado é repassado diretamente como corpo da
 * `Response` da rota Next.js.
 */
export async function getEditionObjectRange(
  key: string,
  rangeHeader: string | null,
): Promise<EditionObjectRangeResult> {
  let result;
  try {
    result = await r2Client().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key, Range: rangeHeader ?? undefined }),
    );
  } catch (error) {
    throw await mapR2RangeError(error, key);
  }

  if (!result.Body) throw new EditionObjectNotFoundError(`Objeto sem conteúdo: ${key}`);

  const sdkBody = result.Body as unknown as {
    transformToWebStream?: () => ReadableStream<Uint8Array>;
  };
  const body =
    typeof sdkBody.transformToWebStream === "function"
      ? sdkBody.transformToWebStream()
      : (result.Body as unknown as ReadableStream<Uint8Array>);

  const contentLength = Number(result.ContentLength ?? 0);
  const contentRange = result.ContentRange ?? null;
  const totalSize = contentRange ? Number(contentRange.split("/")[1] ?? contentLength) : contentLength;

  return {
    body,
    status: contentRange ? 206 : 200,
    contentLength,
    totalSize,
    contentRange,
    contentType: result.ContentType ?? null,
    etag: result.ETag ?? null,
  };
}

function mapR2Error(error: unknown, key: string): Error {
  const name = (error as { name?: string } | undefined)?.name;
  if (name === "NoSuchKey" || name === "NotFound") {
    return new EditionObjectNotFoundError(`Objeto não encontrado: ${key}`);
  }
  return error instanceof Error ? error : new Error("Falha ao consultar o armazenamento do acervo.");
}

async function mapR2RangeError(error: unknown, key: string): Promise<Error> {
  const name = (error as { name?: string } | undefined)?.name;
  if (name === "NoSuchKey" || name === "NotFound") {
    return new EditionObjectNotFoundError(`Objeto não encontrado: ${key}`);
  }
  if (name === "InvalidRange") {
    const head = await headEditionObject(key).catch(() => null);
    return new EditionRangeNotSatisfiableError(head?.contentLength ?? 0);
  }
  return error instanceof Error ? error : new Error("Falha ao consultar o armazenamento do acervo.");
}
