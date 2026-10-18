// Testes locais (node:test, sem rede/Supabase/R2 reais) para as proteções
// adicionadas em 18/10/2026 (Lote 2 — importador do site legado como
// rascunho). Cobre especificamente o item 5: impedir que uma execução
// incorreta publique matérias diretamente, inclusive com parâmetros
// ausentes ou inválidos.
import test from "node:test";
import assert from "node:assert/strict";
import { importCandidate } from "./importer.mjs";

/** Mock mínimo e genérico da cadeia `sb.from(table).select().eq()...`
 * usada por findExistingArticleId/resolveSectionId — cada método, exceto o
 * terminal escolhido, retorna o próprio mock (encadeável). */
function makeChainMock(terminalResult) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => terminalResult,
    single: async () => terminalResult,
  };
  return chain;
}

function makeSbMock({ existingArticleId = null, rpcResult = { data: "new-article-id", error: null } } = {}) {
  const rpcCalls = [];
  return {
    rpcCalls,
    from(table) {
      if (table === "article_external_sources") {
        return makeChainMock({ data: existingArticleId ? { article_id: existingArticleId } : null, error: null });
      }
      if (table === "article_media") {
        // Candidatas de teste nunca têm imagens (detail sem coverUrl/galleryImages),
        // então reconcileArticleImages só precisa ver uma lista vazia de vínculos.
        return { ...makeChainMock({ data: [], error: null }), eq: () => makeChainMock({ data: [], error: null }) };
      }
      throw new Error(`Mock sb.from não configurado para a tabela "${table}" neste teste.`);
    },
    async rpc(name, payload) {
      rpcCalls.push({ name, payload });
      return rpcResult;
    },
  };
}

function baseCandidate() {
  return {
    identity: { externalId: "999", sourceUrl: null, normalizedUrl: "https://www.informativoregional.net/geral/x.999" },
    primary: {
      url: "https://www.informativoregional.net/geral/x.999",
      title: "MATÉRIA DE TESTE",
      category: "geral",
      slug: "materia-de-teste",
      listingDateRaw: "15/10/2026 10:00",
    },
    publishedIso: "2026-10-15",
  };
}

const noopLog = () => {};

test("importCandidate rejeita targetStatus ausente, ANTES de tocar o banco (item 5)", async () => {
  const sb = makeSbMock();
  await assert.rejects(
    () => importCandidate(sb, baseCandidate(), null, {
      sectionCache: new Map(), localityId: "loc-1", throttle: async () => {}, log: noopLog,
      dryRun: false, batchStats: { imported: 0, skippedExisting: 0 }, imageExceptionsFile: null,
      // targetStatus ausente de propósito
      callerLabel: "teste",
    }),
    /targetStatus inválido ou ausente/,
  );
  assert.equal(sb.rpcCalls.length, 0, "a RPC de importação nunca deveria ter sido chamada");
});

test("importCandidate rejeita targetStatus inválido (ex.: typo), ANTES de tocar o banco (item 5)", async () => {
  const sb = makeSbMock();
  await assert.rejects(
    () => importCandidate(sb, baseCandidate(), null, {
      sectionCache: new Map(), localityId: "loc-1", throttle: async () => {}, log: noopLog,
      dryRun: false, batchStats: { imported: 0, skippedExisting: 0 }, imageExceptionsFile: null,
      targetStatus: "publishedd", // typo deliberado
      callerLabel: "teste",
    }),
    /targetStatus inválido ou ausente/,
  );
  assert.equal(sb.rpcCalls.length, 0);
});

test("importCandidate em dry-run NUNCA chama a RPC de importação, mesmo com targetStatus válido", async () => {
  const sb = makeSbMock();
  const result = await importCandidate(sb, baseCandidate(), null, {
    sectionCache: new Map(), localityId: "loc-1", throttle: async () => {}, log: noopLog,
    dryRun: true, batchStats: { imported: 0, skippedExisting: 0 }, imageExceptionsFile: null,
    targetStatus: "draft", callerLabel: "teste",
  });
  assert.equal(sb.rpcCalls.length, 0, "dry-run nunca deve gravar nada");
  assert.equal(result.articleId, null, "dry-run nunca cria um articleId real");
});

test("importCandidate com targetStatus='draft' grava status=draft E preserva a data original em published_at", async () => {
  const sb = makeSbMock({ existingArticleId: null });
  const sectionCache = new Map([["geral", "section-geral-id"]]); // evita precisar mockar editorial_sections
  const batchStats = { imported: 0, skippedExisting: 0 };

  await importCandidate(sb, baseCandidate(), { title: "Título real", bodyHtml: "<p>corpo</p>", publishedRaw: "15/10/2026 10:00" }, {
    sectionCache, localityId: "loc-1", throttle: async () => {}, log: noopLog,
    dryRun: false, batchStats, imageExceptionsFile: null,
    targetStatus: "draft", callerLabel: "teste",
  });

  assert.equal(sb.rpcCalls.length, 1);
  const { name, payload } = sb.rpcCalls[0];
  assert.equal(name, "legacy_import_article");
  assert.equal(payload.article.status, "draft", "deve gravar status=draft explicitamente, nunca confiar no default da função SQL");
  assert.ok(payload.article.published_at, "published_at não pode ficar vazio — é a data original preservada");
  assert.match(payload.article.published_at, /^2026-10-15/, "published_at deve refletir a data ORIGINAL da matéria, não a data da importação");
  assert.equal(payload.source.original_published_at, payload.article.published_at, "article_external_sources.original_published_at deve bater com articles.published_at na criação");
  assert.equal(batchStats.imported, 1);
});

test("importCandidate com targetStatus='published' (uso exclusivo da migração histórica) continua funcionando", async () => {
  const sb = makeSbMock({ existingArticleId: null });
  const sectionCache = new Map([["geral", "section-geral-id"]]);
  const batchStats = { imported: 0, skippedExisting: 0 };

  await importCandidate(sb, baseCandidate(), { title: "Título real", bodyHtml: "<p>corpo</p>", publishedRaw: "15/10/2026 10:00" }, {
    sectionCache, localityId: "loc-1", throttle: async () => {}, log: noopLog,
    dryRun: false, batchStats, imageExceptionsFile: null,
    targetStatus: "published", callerLabel: "migrate.mjs (lote histórico)",
  });

  assert.equal(sb.rpcCalls[0].payload.article.status, "published");
});

test("importCandidate NUNCA sobrescreve/reconcilia as matérias já existentes quando targetStatus é inválido (falha cedo, antes do existingId importar)", async () => {
  // Candidata já existente (existingArticleId preenchido) — mesmo assim, o
  // guard de targetStatus dispara antes de decidir "wasExisting", então uma
  // chamada mal configurada nunca chega a tocar os dados da matéria existente.
  const sb = makeSbMock({ existingArticleId: "existing-article-id" });
  await assert.rejects(
    () => importCandidate(sb, baseCandidate(), null, {
      sectionCache: new Map(), localityId: "loc-1", throttle: async () => {}, log: noopLog,
      dryRun: false, batchStats: { imported: 0, skippedExisting: 0 }, imageExceptionsFile: null,
      callerLabel: "teste",
    }),
    /targetStatus inválido ou ausente/,
  );
});
