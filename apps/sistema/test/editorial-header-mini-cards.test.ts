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

test("Matérias abre sempre a tabela anterior; edição só altera a ordenação inicial", () => {
  const page = read("../src/app/sistema/editorial/materias/page.tsx");
  const list = read("../src/features/editorial/MateriasList.tsx");
  const repo = read("../src/providers/supabase/articleRepository.supabase.ts");
  assert.match(page, /<MateriasList/);
  assert.doesNotMatch(page, /EditionArticleGroups|groupedView|Matérias agrupadas por edição/);
  assert.match(page, /\(value as MateriasSortColumn\) : "edition"/);
  assert.match(list, /SORTABLE_COLUMNS/);
  assert.match(list, /<table className="materias-table">/);
  assert.match(list, /name="edition"/);
  assert.match(repo, /edition: "edition_sort_number"/);
  assert.doesNotMatch(repo, /articles_admin_edition_order/);
  assert.match(repo, /sortBy === "edition"/);
});

// Não voltar a espalhar o cabeçalho nem esconder a ordenação por edição.
test("Matérias exibe ordenação ativa e cabeçalho compacto, sem alterar colunas", () => {
  const list = read("../src/features/editorial/MateriasList.tsx");
  const css = read("../src/app/globals.css");
  assert.match(list, /activeSortName = filters\.sortBy === "edition"/);
  assert.doesNotMatch(list, /className="materias-active-order"/);
  assert.match(list, /className="materias-mobile-active-order"/);
  assert.match(list, /className=\{filters\.sortBy === column\.key \? "is-active-sort"/);
  assert.match(list, /SORTABLE_COLUMNS\.map/);
  assert.match(css, /\.materias-mobile-page \.materias-list-root \.materias-table\{\s*table-layout:fixed;/);
  assert.match(css, /\.materias-mobile-page \.materias-list-root \.materias-table thead th\.is-active-sort/);
  assert.match(css, /\.materias-mobile-page \.materias-list-root \.materias-toolbar-compact\{/);
});

test("tabela indica edição na coluna ativa e não oferece filtro de fotos ou origem importada", () => {
  const list = read("../src/features/editorial/MateriasList.tsx");
  assert.match(list, /\{ key: "edition", label: "Edição" \}/);
  assert.match(list, /className="materia-edition-cell"/);
  assert.match(list, /filters\.sortBy === column\.key \? "is-active-sort"/);
  assert.match(list, /sortIndicator\(column\.key\)/);
  assert.match(list, /name="edition"/);
  assert.doesNotMatch(list, /Fotos nesta página|photoFilter|ORIGIN_OPTIONS|origin-pill/);
  assert.doesNotMatch(list, /className="materias-active-order"/);
});
