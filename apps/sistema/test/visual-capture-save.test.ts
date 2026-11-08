import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRegionsPayload,
  describeSummary,
  isUnsaved,
  saveDraftsBatch,
  type SaveableCapture,
  type SaveBatchDeps,
} from "../src/features/editorial/visualCaptureSave";

// Salvamento explícito ("Salvar rascunhos"). Só dependências falsas — nenhum
// teste toca produção nem cria matérias na edição 776.

const EDITION = "00000000-0000-4000-8000-000000000001";
const RECT = { x: 0.1, y: 0.1, width: 0.3, height: 0.2 };

function capture(id: string, overrides: Partial<SaveableCapture> = {}): SaveableCapture {
  return {
    id,
    articleId: null,
    updatedAtISO: null,
    title: `Título ${id}`,
    subtitle: "",
    body: `Corpo ${id}`,
    needsReview: false,
    areas: [{ page: 2, rect: RECT }],
    perAreaExtraction: [{ title: `Título ${id}`, subtitle: "", bodyParagraphs: [`Corpo ${id}`], needsReview: false, warnings: [] }],
    saveStatus: "pending",
    ...overrides,
  };
}

interface Db {
  articles: Map<string, { id: string; clientId: string | null; title: string; body: string; updatedAt: string; archived: boolean }>;
  calls: string[];
  fail: Set<string>;
}

function fakeDeps(db: Db): SaveBatchDeps {
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 10, 7, 12, 0, ++clock)).toISOString();
  return {
    createDraft: async (input) => {
      db.calls.push(`create:${input.clientCaptureId}`);
      if (db.fail.has(input.clientCaptureId)) return { ok: false, error: "falha de conexão simulada" };
      const existing = [...db.articles.values()].find((a) => a.clientId === input.clientCaptureId);
      if (existing) return { ok: true, data: { articleId: existing.id, updatedAt: existing.updatedAt } };
      const id = `art-${db.articles.size + 1}`;
      const row = { id, clientId: input.clientCaptureId, title: input.title, body: input.body, updatedAt: stamp(), archived: false };
      db.articles.set(id, row);
      return { ok: true, data: { articleId: id, updatedAt: row.updatedAt } };
    },
    saveState: async (input) => {
      db.calls.push(`save:${input.articleId}`);
      const row = db.articles.get(input.articleId);
      if (!row) return { ok: false, error: "não encontrada" };
      if (row.updatedAt !== input.expectedUpdatedAt) return { ok: false, conflict: true, error: "alterada em outra sessão" };
      row.title = input.title;
      row.body = input.body;
      row.updatedAt = stamp();
      return { ok: true, data: { applied: true, updatedAt: row.updatedAt } };
    },
    archiveDraft: async (articleId) => {
      db.calls.push(`archive:${articleId}`);
      const row = db.articles.get(articleId);
      if (!row) return { ok: false, error: "não encontrada" };
      row.archived = true;
      return { ok: true };
    },
    loadDrafts: async () => ({
      ok: true,
      data: [...db.articles.values()]
        .filter((a) => !a.archived)
        .map((a) => ({ articleId: a.id, title: a.title, subtitle: null, body: a.body, updatedAt: a.updatedAt })),
    }),
  };
}

function newDb(): Db {
  return { articles: new Map(), calls: [], fail: new Set() };
}

test("capturar e corrigir (nada salvo ainda) não faz NENHUMA chamada ao banco — só saveDraftsBatch escreve", () => {
  const db = newDb();
  fakeDeps(db);
  const local = [capture("a"), capture("b")];
  local[0].title = "Título corrigido";
  assert.deepEqual(db.calls, []);
  assert.equal(local.filter(isUnsaved).length, 2);
});

test("cadastrar várias matérias com um único clique: cria todas, 1 chamada por matéria, resumo correto", async () => {
  const db = newDb();
  const { results, summary } = await saveDraftsBatch([capture("a"), capture("b"), capture("c")], EDITION, fakeDeps(db));
  assert.equal(db.articles.size, 3);
  assert.deepEqual(summary, { created: 3, updated: 0, archived: 0, failed: 0 });
  assert.ok(results.every((r) => r.articleId && r.updatedAt));
  assert.equal(describeSummary(summary), "3 criada(s)");
});

test("excluir e recapturar ANTES de salvar não duplica: só as matérias que restam na lista são criadas", async () => {
  const db = newDb();
  const { summary } = await saveDraftsBatch([capture("a2")], EDITION, fakeDeps(db));
  assert.equal(db.articles.size, 1);
  assert.equal(summary.created, 1);
});

test("repetir o salvamento não duplica: mesma chave => mesma matéria (idempotência por clientCaptureId)", async () => {
  const db = newDb();
  const deps = fakeDeps(db);
  const first = await saveDraftsBatch([capture("a")], EDITION, deps);
  const second = await saveDraftsBatch([capture("a")], EDITION, deps);
  assert.equal(db.articles.size, 1);
  assert.equal(first.results[0].articleId, second.results[0].articleId);
});

test("só matérias pendentes/erro vão ao banco — as já salvas e sem alteração são ignoradas", async () => {
  const db = newDb();
  const saved = capture("s", { articleId: "art-x", updatedAtISO: "t", saveStatus: "saved" });
  const { results } = await saveDraftsBatch([saved, capture("n")], EDITION, fakeDeps(db));
  assert.equal(results.length, 1);
  assert.equal(results[0].captureId, "n");
  assert.deepEqual(db.calls, ["create:n"]);
});

test("atualizar matéria já existente usa o updated_at confirmado e não cria duplicata", async () => {
  const db = newDb();
  const deps = fakeDeps(db);
  const created = await saveDraftsBatch([capture("a")], EDITION, deps);
  const { articleId, updatedAt } = created.results[0];
  const edited = capture("a", { articleId: articleId!, updatedAtISO: updatedAt!, title: "Novo título", saveStatus: "pending" });
  const { summary } = await saveDraftsBatch([edited], EDITION, deps);
  assert.deepEqual(summary, { created: 0, updated: 1, archived: 0, failed: 0 });
  assert.equal(db.articles.size, 1);
  assert.equal(db.articles.get(articleId!)!.title, "Novo título");
});

test("atualização repetida após resposta perdida é reconhecida como salva (não vira falso conflito)", async () => {
  const db = newDb();
  const deps = fakeDeps(db);
  const created = await saveDraftsBatch([capture("a")], EDITION, deps);
  const { articleId, updatedAt } = created.results[0];
  const edited = capture("a", { articleId: articleId!, updatedAtISO: updatedAt!, title: "Novo título", body: "Novo corpo", saveStatus: "pending" });
  await saveDraftsBatch([edited], EDITION, deps);
  const retry = await saveDraftsBatch([edited], EDITION, deps);
  assert.equal(retry.summary.updated, 1);
  assert.equal(retry.summary.failed, 0);
});

test("conflito REAL (outra sessão mudou o texto) não sobrescreve e é reportado como erro", async () => {
  const db = newDb();
  const deps = fakeDeps(db);
  const created = await saveDraftsBatch([capture("a")], EDITION, deps);
  const { articleId, updatedAt } = created.results[0];
  const other = db.articles.get(articleId!)!;
  other.title = "Editada por outra pessoa";
  other.updatedAt = "2099-01-01T00:00:00.000Z";
  const mine = capture("a", { articleId: articleId!, updatedAtISO: updatedAt!, title: "Minha edição", saveStatus: "pending" });
  const { summary, results } = await saveDraftsBatch([mine], EDITION, deps);
  assert.equal(summary.failed, 1);
  assert.match(results[0].error ?? "", /outra sessão/);
  assert.equal(other.title, "Editada por outra pessoa");
});

test("remover região de matéria salva = atualização com as regiões restantes (nada de DELETE)", async () => {
  const db = newDb();
  const deps = fakeDeps(db);
  const two = capture("a", {
    areas: [{ page: 2, rect: RECT }, { page: 3, rect: RECT }],
    perAreaExtraction: [
      { title: "T", subtitle: "", bodyParagraphs: ["p1"], needsReview: false, warnings: [] },
      { title: "", subtitle: "", bodyParagraphs: ["p2"], needsReview: false, warnings: [] },
    ],
  });
  const created = await saveDraftsBatch([two], EDITION, deps);
  const reduced = capture("a", {
    articleId: created.results[0].articleId!,
    updatedAtISO: created.results[0].updatedAt!,
    areas: [{ page: 2, rect: RECT }],
    perAreaExtraction: [two.perAreaExtraction[0]],
    body: "p1",
  });
  const { summary } = await saveDraftsBatch([reduced], EDITION, deps);
  assert.equal(summary.updated, 1);
  assert.equal(buildRegionsPayload(reduced.areas, reduced.perAreaExtraction).length, 1);
});

test("remover a ÚLTIMA região de matéria salva: só arquiva ao salvar (pendingArchive) e a matéria sai da lista", async () => {
  const db = newDb();
  const deps = fakeDeps(db);
  const created = await saveDraftsBatch([capture("a")], EDITION, deps);
  const marked = capture("a", { articleId: created.results[0].articleId!, updatedAtISO: created.results[0].updatedAt!, pendingArchive: true });
  assert.equal(db.articles.get(created.results[0].articleId!)!.archived, false, "antes de salvar nada muda no banco");
  const { summary } = await saveDraftsBatch([marked], EDITION, deps);
  assert.equal(summary.archived, 1);
  assert.equal(db.articles.get(created.results[0].articleId!)!.archived, true);
});

test("matéria nunca salva removida da lista não gera chamada ao banco (dropped)", async () => {
  const db = newDb();
  const { results } = await saveDraftsBatch([capture("a", { pendingArchive: true })], EDITION, fakeDeps(db));
  assert.equal(results[0].outcome, "dropped");
  assert.deepEqual(db.calls, []);
});

test("falha parcial: as demais são salvas, a que falhou continua pendente e uma nova tentativa grava só ela", async () => {
  const db = newDb();
  db.fail.add("b");
  const deps = fakeDeps(db);
  const first = await saveDraftsBatch([capture("a"), capture("b"), capture("c")], EDITION, deps);
  assert.deepEqual(first.summary, { created: 2, updated: 0, archived: 0, failed: 1 });
  assert.equal(db.articles.size, 2);

  db.fail.clear();
  const after = [
    capture("a", { articleId: first.results[0].articleId!, updatedAtISO: first.results[0].updatedAt!, saveStatus: "saved" }),
    capture("b", { saveStatus: "error" }),
    capture("c", { articleId: first.results[2].articleId!, updatedAtISO: first.results[2].updatedAt!, saveStatus: "saved" }),
  ];
  const retry = await saveDraftsBatch(after, EDITION, deps);
  assert.deepEqual(retry.summary, { created: 1, updated: 0, archived: 0, failed: 0 });
  assert.equal(db.articles.size, 3);
});

test("exceção de rede em uma matéria não derruba o lote", async () => {
  const db = newDb();
  const deps = fakeDeps(db);
  const original = deps.createDraft;
  deps.createDraft = async (input) => {
    if (input.clientCaptureId === "a") throw new Error("ECONNRESET");
    return original(input);
  };
  const { summary, results } = await saveDraftsBatch([capture("a"), capture("b")], EDITION, deps);
  assert.deepEqual(summary, { created: 1, updated: 0, archived: 0, failed: 1 });
  assert.equal(results[0].error, "ECONNRESET");
});

test("o salvamento nunca publica nem notifica: só usa create/save/archive", async () => {
  const db = newDb();
  await saveDraftsBatch([capture("a"), capture("b")], EDITION, fakeDeps(db));
  assert.ok(db.calls.every((call) => /^(create|save|archive):/.test(call)));
});

test("describeSummary: texto do resumo", () => {
  assert.equal(describeSummary({ created: 2, updated: 1, archived: 1, failed: 1 }), "2 criada(s) · 1 atualizada(s) · 1 arquivada(s) · 1 com erro");
  assert.equal(describeSummary({ created: 0, updated: 0, archived: 0, failed: 0 }), "Nada a salvar.");
});
