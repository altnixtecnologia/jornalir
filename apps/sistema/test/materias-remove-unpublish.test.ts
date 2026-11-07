import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ACTIONS = readFileSync(new URL("../src/app/sistema/editorial/materias/actions.ts", import.meta.url), "utf8");
const LIST = readFileSync(new URL("../src/features/editorial/MateriasList.tsx", import.meta.url), "utf8");
const FORM = readFileSync(new URL("../src/features/editorial/ArticleForm.tsx", import.meta.url), "utf8");
const REPO = readFileSync(new URL("../src/providers/supabase/articleRepository.supabase.ts", import.meta.url), "utf8");

function body(source: string, fn: string): string {
  const start = source.indexOf(`export async function ${fn}(`);
  assert.ok(start >= 0, `${fn} existe`);
  const next = source.indexOf("\nexport async function ", start + 10);
  return source.slice(start, next < 0 ? undefined : next);
}

test("Remover: só não publicadas, arquiva (nunca apaga), audita com o usuário real", () => {
  const remove = body(ACTIONS, "removeUnpublishedArticle");
  assert.match(remove, /checkModuleAction\("editorial", "materias_arquivar"\)/);
  assert.match(remove, /current\.status === "published"\)\s*\{\s*return \{ error:/);
  assert.match(remove, /articleService\.archive\(id, AUDIT\)/);
  assert.match(remove, /logArticleEvent\(client, AUDIT\.actorId, id, "remove"/);
  assert.doesNotMatch(remove, /\.delete\(/);
});

test("Despublicar: só a partir de publicada, volta a rascunho, exige permissão de publicar e audita", () => {
  const unpublish = body(ACTIONS, "unpublishArticle");
  assert.match(unpublish, /checkModuleAction\("editorial", "materias_publicar"\)/);
  assert.match(unpublish, /current\.status !== "published"\) return \{ error:/);
  assert.match(unpublish, /updateDraft\(id, \{ status: "draft" \}, AUDIT\)/);
  assert.match(unpublish, /"unpublish"/);
  // Não apaga a data original: republicar mantém published_at.
  assert.doesNotMatch(unpublish, /publishedAt/);
});

test("telas: Remover só para rascunho/em ajuste/programada; Despublicar só dentro da matéria publicada", () => {
  assert.match(LIST, /article\.status === "draft" \|\| article\.status === "adjusting" \|\| article\.status === "scheduled"/);
  assert.match(FORM, /article\?\.status === "published" \? \(\s*<button type="button" className="form-action-warning" onClick=\{handleUnpublish\}/);
});

test("Remover também dentro da matéria não publicada, voltando à listagem; Arquivar fica só para as demais", () => {
  assert.match(FORM, /const canRemove =\s*mode === "edit" &&\s*\(article\?\.status === "draft" \|\| article\?\.status === "adjusting" \|\| article\?\.status === "scheduled"\)/);
  assert.match(FORM, /await removeUnpublishedArticle\(article\.id\)[\s\S]*?router\.push\(LIST_HREF\)/);
  assert.match(FORM, /\{renderRemoveButton\("article-remove-top"\)\}/);
  assert.match(FORM, /article\?\.status !== "archived" && !canRemove \?/);
});

test("listagem 'Status: todos' esconde arquivadas; filtro Arquivado continua mostrando", () => {
  assert.match(REPO, /if \(input\.status && input\.status !== "all"\) query = query\.eq\("status", input\.status\);\s*else query = query\.neq\("status", "archived"\);/);
});
