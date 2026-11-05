import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EDITION_ARCHIVE = readFileSync(
  resolve(__dirname, "../src/providers/r2/editionArchive.r2.ts"),
  "utf8",
);
const MEDIA_STORAGE = readFileSync(resolve(__dirname, "../src/providers/r2/mediaStorage.r2.ts"), "utf8");

/**
 * Segunda conta Cloudflare para o bucket exclusivo de edições (04/11/2026):
 * endpoint também precisa ser exclusivo via R2_EDITIONS_ENDPOINT, sem
 * fallback silencioso para a conta antiga quando o bucket é exclusivo.
 */

function extractFunction(source: string, signaturePrefix: string): string {
  const start = source.indexOf(signaturePrefix);
  assert.ok(start >= 0, `trecho "${signaturePrefix}" não encontrado`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  const nextExport = source.indexOf("\nexport ", start + 1);
  const candidates = [nextFunction, nextExport].filter((i) => i !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test("mediaStorage.r2.ts (imagens) continua usando só R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY, sem referenciar nada de edições", () => {
  assert.match(MEDIA_STORAGE, /requiredEnv\("R2_ENDPOINT"\)/);
  assert.match(MEDIA_STORAGE, /requiredEnv\("R2_ACCESS_KEY_ID"\)/);
  assert.match(MEDIA_STORAGE, /requiredEnv\("R2_SECRET_ACCESS_KEY"\)/);
  assert.doesNotMatch(MEDIA_STORAGE, /R2_EDITIONS_/);
});

test("editionEndpoint() exige R2_EDITIONS_ENDPOINT quando o bucket é exclusivo, sem reaproveitar R2_ENDPOINT da conta antiga", () => {
  const fn = extractFunction(EDITION_ARCHIVE, "function editionEndpoint(");
  assert.match(fn, /if \(hasDedicatedEditionBucket\(\)\)/);
  assert.match(fn, /return requiredEnv\("R2_EDITIONS_ENDPOINT"\);/);
  assert.match(fn, /return env\("R2_EDITIONS_ENDPOINT"\) \?\? requiredEnv\("R2_ENDPOINT"\);/);
});

test("isEditionR2ReadConfigured() não exige publicBase() — bucket pode continuar privado (sem domínio público) para operações só de leitura", () => {
  const readFn = extractFunction(EDITION_ARCHIVE, "export function isEditionR2ReadConfigured(");
  assert.doesNotMatch(readFn, /publicBase\(\);/);
  assert.match(readFn, /editionEndpoint\(\);/);
  assert.match(readFn, /editionCredentials\(\);/);

  const fullFn = extractFunction(EDITION_ARCHIVE, "export function isEditionR2ArchiveConfigured(");
  assert.match(fullFn, /publicBase\(\);/);
});

test("r2Client() e presignPutUrl() usam editionEndpoint(), não requiredEnv(\"R2_ENDPOINT\") direto", () => {
  const client = extractFunction(EDITION_ARCHIVE, "function r2Client(");
  assert.match(client, /endpoint: editionEndpoint\(\)/);

  const presign = extractFunction(EDITION_ARCHIVE, "function presignPutUrl(");
  assert.match(presign, /new URL\(editionEndpoint\(\)\)/);
});

test("isEditionR2ArchiveConfigured() falha de forma segura (retorna false) quando falta configuração obrigatória, em vez de lançar sem tratamento", () => {
  const fn = extractFunction(EDITION_ARCHIVE, "export function isEditionR2ArchiveConfigured(");
  assert.match(fn, /try \{/);
  assert.match(fn, /editionEndpoint\(\);/);
  assert.match(fn, /catch \{\s*return false;/);
});

test("compatibilidade legada preservada: sem bucket exclusivo, bucket()/publicBase() continuam caindo para R2_BUCKET/R2_PUBLIC_BASE_URL", () => {
  const bucketFn = extractFunction(EDITION_ARCHIVE, "function bucket(");
  assert.match(bucketFn, /requiredEnv\("R2_BUCKET"\)/);

  const publicBaseFn = extractFunction(EDITION_ARCHIVE, "function publicBase(");
  assert.match(publicBaseFn, /requiredEnv\("R2_PUBLIC_BASE_URL"\)/);
});

/**
 * Bloqueio real encontrado em produção (05/11/2026): nenhum projeto Vercel
 * tem `R2_EDITIONS_PUBLIC_BASE_URL` configurada (decisão é manter o bucket
 * privado — a entrega pública é só pelas rotas de proxy do portal). As três
 * ações do painel (upload, verificar acervo, reaproveitar) usavam
 * `isEditionR2ArchiveConfigured()`, que EXIGE essa URL — isso bloquearia
 * qualquer upload/reaproveitamento em produção mesmo com endpoint/bucket/
 * credenciais corretos. Corrigido: as três passaram a usar
 * `isEditionR2ReadConfigured()` (mesmo mínimo de `isEditionR2ReadConfigured`
 * — nunca exige URL pública) e `getEditionArchivePublicUrl`/
 * `publicUrl`-em-buffers nunca mais lançam exceção por faltar essa URL.
 */
test("as ações do painel (upload, verificar acervo, reaproveitar) usam isEditionR2ReadConfigured(), nunca isEditionR2ArchiveConfigured() — nunca exigem URL pública para operar", () => {
  const ACTIONS = readFileSync(
    resolve(__dirname, "../src/app/sistema/editorial/edicoes/actions.ts"),
    "utf8",
  );
  const configuredChecks = ACTIONS.match(/isEditionR2\w+Configured\(\)/g) ?? [];
  assert.ok(configuredChecks.length >= 3, "esperava pelo menos 3 checagens de configuração nas ações de edições");
  for (const call of configuredChecks) {
    assert.equal(call, "isEditionR2ReadConfigured()", `chamada inesperada: ${call}`);
  }
  assert.doesNotMatch(ACTIONS, /isEditionR2ArchiveConfigured/);
});

test("getEditionArchivePublicUrl() e as funções de upload de capa nunca lançam por falta de URL pública — publicUrl() (que lança) só é usado via publicUrlOrNull()", () => {
  const getPublicUrlFn = extractFunction(EDITION_ARCHIVE, "export function getEditionArchivePublicUrl(");
  assert.match(getPublicUrlFn, /publicUrlOrNull\(key\)/);

  const publicUrlOrNullFn = extractFunction(EDITION_ARCHIVE, "function publicUrlOrNull(");
  assert.match(publicUrlOrNullFn, /try \{/);
  assert.match(publicUrlOrNullFn, /catch \{\s*return null;/);

  // Os dois caminhos realmente usados pelo painel (plano de upload direto
  // e upload de capa em buffer, reaproveitamento do acervo) usam a variante
  // que nunca lança. `uploadEditionPdfToR2`/`uploadEditionCoverToR2`
  // (código legado, sem nenhum caller hoje) não foram tocados de propósito
  // — não fazem parte de nenhum caminho crítico de publicação.
  const directUploadPlanFn = extractFunction(EDITION_ARCHIVE, "export function createEditionDirectUploadPlan(");
  assert.doesNotMatch(directUploadPlanFn, /publicUrl: publicUrl\(/);
  assert.match(directUploadPlanFn, /publicUrl: publicUrlOrNull\(/);

  const coverBufferFn = extractFunction(EDITION_ARCHIVE, "export async function uploadEditionCoverBufferToR2(");
  assert.doesNotMatch(coverBufferFn, /publicUrl: publicUrl\(/);
  assert.match(coverBufferFn, /publicUrl: publicUrlOrNull\(/);
});
