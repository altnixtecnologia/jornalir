import "server-only";

import {
  EditionArchiveObjectNotFoundError,
  EditionArchiveRangeNotSatisfiableError,
  getEditionArchiveObjectRange,
  headEditionArchiveObject,
  isEditionR2ReadConfigured,
  type EditionArchiveObjectHead,
  type EditionArchiveObjectRangeResult,
} from "../../providers/r2/editionArchive.r2";

/**
 * Entrega AUTENTICADA do PDF oficial de uma edição, direto do R2, para a
 * captura visual de matérias (Editorial → Edições → Detalhes → "Capturar
 * matérias visualmente"). Mesmo desenho do proxy público do portal
 * (`apps/site/.../editionAssetProxy.ts`), com duas diferenças
 * deliberadas: (1) exige sessão + permissão editorial — nunca público; (2)
 * aceita qualquer edição com PDF arquivado no R2, não só `active`/liberada
 * ao público (o operador pode capturar matérias de uma edição ainda não
 * publicada no Jornal Online).
 *
 * A chave do objeto R2 NUNCA vem da URL — só o id da edição (Supabase) é
 * aceito; a chave é resolvida aqui, no servidor, a partir do registro.
 */

interface EditionPdfLookupRow {
  archiveProvider?: string;
  pdfR2Key?: string;
}

export interface EditionPdfProxyRequest {
  editionId: string;
  method: "GET" | "HEAD";
  rangeHeader: string | null;
}

/**
 * Dependências injetáveis — só para teste automatizado (unit tests mockam
 * permissão/Supabase/R2 sem rede real). Em produção, a rota chama
 * `handleEditionPdfProxyRequest` sem o segundo argumento.
 */
export interface EditionPdfProxyDeps {
  checkPermission: () => Promise<string | null>;
  lookupEdition: (id: string) => Promise<EditionPdfLookupRow | null>;
  isR2Configured: () => boolean;
  headObject: (key: string) => Promise<EditionArchiveObjectHead>;
  getObjectRange: (key: string, rangeHeader: string | null) => Promise<EditionArchiveObjectRangeResult>;
}

// Import dinâmico (não no topo do arquivo): `checkModuleAction`/
// `createSupabaseServerClient` carregam `next/headers` (cookies da sessão),
// que só existe dentro de uma requisição real do Next.js. Importar essas
// duas peças apenas quando de fato chamadas (produção) permite que os
// testes automatizados carreguem este módulo e injetem suas PRÓPRIAS
// `deps` sem precisar de uma requisição/sessão real.
async function defaultCheckPermission(): Promise<string | null> {
  const { checkModuleAction } = await import("../permissions/checkModuleAction");
  return checkModuleAction("editorial", "edicoes_gerenciar");
}

async function defaultLookupEdition(id: string): Promise<EditionPdfLookupRow | null> {
  const [{ createSupabaseServerClient }, { getNewspaperEditionService }] = await Promise.all([
    import("../supabase/server"),
    import("../../composition/editorial"),
  ]);
  const client = createSupabaseServerClient();
  return getNewspaperEditionService(client).getById(id);
}

const defaultDeps: EditionPdfProxyDeps = {
  checkPermission: defaultCheckPermission,
  lookupEdition: defaultLookupEdition,
  isR2Configured: isEditionR2ReadConfigured,
  headObject: headEditionArchiveObject,
  getObjectRange: getEditionArchiveObjectRange,
};

const UUID_LIKE = /^[0-9a-f-]{8,64}$/i;

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function handleEditionPdfProxyRequest(
  request: EditionPdfProxyRequest,
  deps: EditionPdfProxyDeps = defaultDeps,
): Promise<Response> {
  const { editionId, method, rangeHeader } = request;

  if (!editionId || !UUID_LIKE.test(editionId)) {
    return jsonError(404, "Edição não encontrada.");
  }

  const permissionError = await deps.checkPermission();
  if (permissionError) return jsonError(403, permissionError);

  if (!deps.isR2Configured()) {
    return jsonError(503, "Leitura do acervo de edições temporariamente indisponível.");
  }

  let edition: EditionPdfLookupRow | null;
  try {
    edition = await deps.lookupEdition(editionId);
  } catch {
    return jsonError(503, "Não foi possível consultar a edição agora. Tente novamente em instantes.");
  }

  if (!edition || edition.archiveProvider !== "r2" || !edition.pdfR2Key) {
    return jsonError(404, "Esta edição não tem PDF arquivado no R2.");
  }
  const key = edition.pdfR2Key;

  try {
    if (method === "HEAD") {
      const head = await deps.headObject(key);
      return new Response(null, { status: 200, headers: buildHeaders(head.contentType, head.contentLength, head.etag, null) });
    }
    const result = await deps.getObjectRange(key, rangeHeader);
    return new Response(result.body, {
      status: result.status,
      headers: buildHeaders(result.contentType, result.contentLength, result.etag, result.contentRange),
    });
  } catch (error) {
    if (error instanceof EditionArchiveRangeNotSatisfiableError) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${error.totalSize}`, "Cache-Control": "no-store" } });
    }
    if (error instanceof EditionArchiveObjectNotFoundError) {
      return jsonError(404, "PDF não encontrado no acervo.");
    }
    return jsonError(502, "Não foi possível obter o PDF agora. Tente novamente em instantes.");
  }
}

function buildHeaders(contentType: string | null, contentLength: number, etag: string | null, contentRange: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": contentType && contentType.startsWith("application/") ? contentType : "application/pdf",
    "Content-Length": String(contentLength),
    "Accept-Ranges": "bytes",
    // Nunca em cache compartilhado/CDN — rota autenticada, conteúdo editorial interno.
    "Cache-Control": "private, no-store",
  };
  if (contentRange) headers["Content-Range"] = contentRange;
  if (etag) headers["ETag"] = etag;
  return headers;
}
