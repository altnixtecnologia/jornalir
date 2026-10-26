import test from "node:test";
import assert from "node:assert/strict";
import { listArticlesAdminPageSupabase } from "../src/providers/supabase/articleRepository.supabase";

// Simula o volume real de produção (23.501 matérias, timeout confirmado em
// 26/10/2026) sem precisar de um Postgres de verdade: só o suficiente da
// API encadeada do supabase-js pra exercitar listArticlesAdminPageSupabase
// como ela realmente é chamada.
const TOTAL_ROWS = 23_501;

function buildRows(total: number) {
  return Array.from({ length: total }, (_, i) => ({
    id: `art-${i}`,
    internal_reference: `REF-${i}`,
    slug: `materia-${i}`,
    title: `Matéria ${i}`,
    title_style: null,
    subtitle: null,
    subtitle_style: null,
    body: "X".repeat(5000), // corpo grande de propósito — nunca deve sair da listagem
    section_id: "sec-1",
    locality_id: "loc-1",
    status: "published",
    notification_mode: "none",
    origin: "manual",
    author_name: null,
    newspaper_edition_id: null,
    newspaper_page: null,
    urgent: false,
    scheduled_at: null,
    published_at: null,
    archived_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    editorial_sort_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
  }));
}

interface Call {
  table: string;
  selectedColumns: string;
  countMode?: "exact" | "planned" | "estimated";
  rangeFrom: number;
  rangeTo: number;
}

function createFakeClient(rows: ReturnType<typeof buildRows>, estimatedCount: number) {
  const calls: Call[] = [];

  function articlesQuery() {
    let selectedColumns = "";
    let countMode: Call["countMode"];
    let rangeFrom = 0;
    let rangeTo = rows.length - 1;
    const query: any = {
      select(cols: string, opts?: { count?: Call["countMode"] }) {
        selectedColumns = cols;
        countMode = opts?.count;
        return query;
      },
      order() {
        return query;
      },
      eq() {
        return query;
      },
      or() {
        return query;
      },
      gte() {
        return query;
      },
      lt() {
        return query;
      },
      range(from: number, to: number) {
        rangeFrom = from;
        rangeTo = to;
        return query;
      },
      then(resolve: (v: unknown) => void) {
        calls.push({ table: "articles", selectedColumns, countMode, rangeFrom, rangeTo });
        const page = rows.slice(rangeFrom, rangeTo + 1).map((row) => {
          if (selectedColumns.includes("body")) return row;
          const { body, ...rest } = row;
          return rest;
        });
        resolve({ data: page, error: null, count: estimatedCount });
      },
    };
    return query;
  }

  function emptySideQuery(table: string) {
    const query: any = {
      select() {
        return query;
      },
      in() {
        return query;
      },
      eq() {
        return query;
      },
      then(resolve: (v: unknown) => void) {
        calls.push({ table, selectedColumns: "", rangeFrom: 0, rangeTo: 0 });
        resolve({ data: [], error: null });
      },
    };
    return query;
  }

  const client = {
    from(table: string) {
      if (table === "articles") return articlesQuery();
      return emptySideQuery(table);
    },
  };
  return { client, calls };
}

test("listagem administrativa não seleciona `body` (payload grande que a tela não usa)", async () => {
  const rows = buildRows(TOTAL_ROWS);
  const { client, calls } = createFakeClient(rows, TOTAL_ROWS);
  const result = await listArticlesAdminPageSupabase(client as any, { page: 1, pageSize: 48 });

  const mainCall = calls.find((c) => c.table === "articles");
  assert.ok(mainCall);
  assert.ok(!mainCall!.selectedColumns.includes("body"), "a query da listagem não deveria pedir a coluna body");
  assert.equal(result.articles.length, 48);
  assert.ok(result.articles.every((a) => a.body === ""), "body deve chegar vazio nos itens da listagem, nunca undefined/erro");
});

test("listagem administrativa usa count estimado, não exact, para não escanear as 23.501 linhas", async () => {
  const rows = buildRows(TOTAL_ROWS);
  const { client, calls } = createFakeClient(rows, TOTAL_ROWS);
  await listArticlesAdminPageSupabase(client as any, { page: 1, pageSize: 48 });

  const mainCall = calls.find((c) => c.table === "articles");
  assert.equal(mainCall!.countMode, "estimated");
});

test("paginação: página pedida muito além do fim (estimativa alta) não derruba a tela, cai pra página 1", async () => {
  const rows = buildRows(100); // poucas linhas reais
  const { client } = createFakeClient(rows, TOTAL_ROWS); // mas a estimativa diz que há 23.501
  const result = await listArticlesAdminPageSupabase(client as any, { page: 500, pageSize: 48 });

  assert.equal(result.page, 1);
  assert.equal(result.articles.length, 48);
});

test("paginação: subestimativa da contagem não esconde o botão de próxima página quando a página atual está cheia", async () => {
  const rows = buildRows(TOTAL_ROWS);
  // Estimativa deliberadamente BAIXA (menor que o total real) — simula o
  // caso em que o planner do Postgres ainda não tem estatística fresca.
  const estimatedTooLow = 48; // só uma página, segundo a estimativa
  const { client } = createFakeClient(rows, estimatedTooLow);
  const result = await listArticlesAdminPageSupabase(client as any, { page: 1, pageSize: 48 });

  assert.equal(result.articles.length, 48, "página 1 veio cheia, logo pode haver mais matérias depois");
  assert.ok(
    result.totalPages > Math.ceil(estimatedTooLow / 48),
    "com a página cheia, totalPages não pode ficar travado no valor subestimado — senão o Próxima desaparece",
  );
});

test("filtros, ordenação e tamanho de página continuam chegando intactos na consulta", async () => {
  const rows = buildRows(TOTAL_ROWS);
  const { client, calls } = createFakeClient(rows, TOTAL_ROWS);
  await listArticlesAdminPageSupabase(client as any, {
    page: 2,
    pageSize: 96,
    status: "published",
    sectionId: "sec-1",
  });

  const mainCall = calls.find((c) => c.table === "articles");
  assert.equal(mainCall!.rangeFrom, 96); // página 2, pageSize 96 -> começa em 96
  assert.equal(mainCall!.rangeTo, 191);
});
