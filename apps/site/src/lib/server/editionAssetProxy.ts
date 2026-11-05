import "server-only";

import { getPublicSupabaseClient } from "../public/supabasePublicClient";
import {
  EditionObjectNotFoundError,
  EditionRangeNotSatisfiableError,
  EditionsR2NotConfiguredError,
  getEditionObjectRange,
  headEditionObject,
  isEditionsR2PublicReadConfigured,
} from "./editionsR2";

export type EditionAssetKind = "pdf" | "cover";

interface EditionAssetRow {
  id: string;
  active: boolean;
  archive_provider: string | null;
  pdf_r2_key: string | null;
  cover_r2_key: string | null;
  edition_number: number;
}

export interface EditionAssetRequest {
  id: string;
  kind: EditionAssetKind;
  method: "GET" | "HEAD";
  rangeHeader: string | null;
  download: boolean;
}

/**
 * Dependências injetáveis — só para teste automatizado (unit tests mockam
 * Supabase e R2 sem rede real). Em produção, as rotas chamam
 * `handleEditionAssetRequest` sem o segundo argumento e usam as
 * implementações reais abaixo.
 */
export interface EditionAssetDeps {
  lookupEdition: (id: string) => Promise<EditionAssetRow | null>;
  isR2Configured: () => boolean;
  headObject: typeof headEditionObject;
  getObjectRange: typeof getEditionObjectRange;
}

async function defaultLookupEdition(id: string): Promise<EditionAssetRow | null> {
  const client = getPublicSupabaseClient();
  const { data, error } = await client
    .from("newspaper_editions")
    .select("id, active, archive_provider, pdf_r2_key, cover_r2_key, edition_number")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as EditionAssetRow | null;
}

const defaultDeps: EditionAssetDeps = {
  lookupEdition: defaultLookupEdition,
  isR2Configured: isEditionsR2PublicReadConfigured,
  headObject: headEditionObject,
  getObjectRange: getEditionObjectRange,
};

const UUID_LIKE = /^[0-9a-f-]{8,64}$/i;

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function assetContentType(kind: EditionAssetKind, fallback: string | null): string {
  if (kind === "pdf") return "application/pdf";
  return fallback && fallback.startsWith("image/") ? fallback : "image/webp";
}

function friendlyFileName(kind: EditionAssetKind, editionNumber: number): string {
  return kind === "pdf" ? `IR-${editionNumber}.pdf` : `IR-${editionNumber}-capa.webp`;
}

/**
 * Único ponto de entrega pública de PDF/capa do Jornal Online pelo próprio
 * portal. A chave do objeto R2 NUNCA vem da URL — só o id da edição
 * (cadastrada no Supabase) é aceito; a chave é resolvida aqui, no servidor,
 * a partir do registro ativo. Isso impede escolher livremente um objeto do
 * bucket pela URL (item 2.6 da especificação) e evita expor `pdf_r2_key`/
 * `cover_r2_key` ao navegador.
 */
export async function handleEditionAssetRequest(
  request: EditionAssetRequest,
  deps: EditionAssetDeps = defaultDeps,
): Promise<Response> {
  const { id, kind, method, rangeHeader, download } = request;

  if (!id || !UUID_LIKE.test(id)) {
    return jsonError(404, "Edição não encontrada.");
  }

  if (!deps.isR2Configured()) {
    return jsonError(503, "Entrega de arquivos do Jornal Online temporariamente indisponível.");
  }

  let row: EditionAssetRow | null;
  try {
    row = await deps.lookupEdition(id);
  } catch {
    return jsonError(503, "Não foi possível consultar o acervo agora. Tente novamente em instantes.");
  }

  // Edição inexistente, inativa, ou ainda não vinculada ao R2: nunca
  // entregar nada por este caminho (item 2.8 — nada inativo/não liberado).
  if (!row || !row.active || row.archive_provider !== "r2") {
    return jsonError(404, "Edição não encontrada ou indisponível.");
  }

  const key = kind === "pdf" ? row.pdf_r2_key : row.cover_r2_key;
  if (!key) {
    return jsonError(404, "Arquivo não disponível para esta edição.");
  }

  const fileName = friendlyFileName(kind, row.edition_number);

  try {
    if (method === "HEAD") {
      const head = await deps.headObject(key);
      return new Response(null, {
        status: 200,
        headers: buildHeaders({
          contentType: assetContentType(kind, head.contentType),
          contentLength: head.contentLength,
          etag: head.etag,
          contentRange: null,
          fileName,
          download,
        }),
      });
    }

    const result = await deps.getObjectRange(key, rangeHeader);
    return new Response(result.body, {
      status: result.status,
      headers: buildHeaders({
        contentType: assetContentType(kind, result.contentType),
        contentLength: result.contentLength,
        etag: result.etag,
        contentRange: result.contentRange,
        fileName,
        download,
      }),
    });
  } catch (error) {
    if (error instanceof EditionRangeNotSatisfiableError) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${error.totalSize}`, "Cache-Control": "no-store" },
      });
    }
    if (error instanceof EditionObjectNotFoundError) {
      return jsonError(404, "Arquivo não encontrado no acervo.");
    }
    if (error instanceof EditionsR2NotConfiguredError) {
      return jsonError(503, "Entrega de arquivos do Jornal Online temporariamente indisponível.");
    }
    return jsonError(502, "Não foi possível obter o arquivo agora. Tente novamente em instantes.");
  }
}

function buildHeaders(options: {
  contentType: string;
  contentLength: number;
  etag: string | null;
  contentRange: string | null;
  fileName: string;
  download: boolean;
}): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": options.contentType,
    "Content-Length": String(options.contentLength),
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${options.download ? "attachment" : "inline"}; filename="${options.fileName}"`,
    // Conteúdo do acervo é efetivamente imutável após publicado; permite
    // cache no navegador/CDN sem arriscar servir versão desatualizada por
    // muito tempo em caso de correção pontual.
    "Cache-Control": "public, max-age=3600, must-revalidate",
  };
  if (options.contentRange) headers["Content-Range"] = options.contentRange;
  if (options.etag) headers["ETag"] = options.etag;
  return headers;
}
