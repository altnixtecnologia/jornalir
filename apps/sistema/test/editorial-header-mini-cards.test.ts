import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("cards ocupam o centro do cabeçalho e não uma linha abaixo", () => {
  const page = read("../src/app/sistema/editorial/materias/page.tsx");
  const header = read("../src/components/admin/ModuleHeader.tsx");
  assert.match(page, /middle=\{<EditorialSummaryCards stats=\{stats\} \/>\}/);
  assert.equal((page.match(/<EditorialSummaryCards/g) ?? []).length, 1);
  assert.match(header, /middle \? <div className="module-header-middle">\{middle\}<\/div>/);
  const css = read("../src/app/globals.css");
  assert.match(css, /\.materias-mobile-page \.module-header \.editorial-dashboard-cards/);
});

test("não publicadas não contabiliza nem filtra as programadas", () => {
  const stats = read("../src/features/editorial/editorialArticleStats.ts");
  const query = read("../src/providers/supabase/articleRepository.supabase.ts");
  const cards = read("../src/features/editorial/EditorialSummaryCards.tsx");
  assert.match(stats, /\.in\("status", \["draft", "adjusting"\]\)/);
  assert.match(query, /input\.status === "unpublished"\) query = query\.in\("status", \["draft", "adjusting"\]\)/);
  assert.match(cards, /caption: "Rascunhos e ajustes"/);
  assert.match(cards, /status=scheduled/);
});
