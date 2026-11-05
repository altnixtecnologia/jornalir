import test from "node:test";
import assert from "node:assert/strict";
import { findPossibleDuplicateArticles } from "../src/lib/editorial/articleDuplicateDetection";

test("título idêntico a uma matéria existente gera correspondência de alta pontuação (reason: title)", () => {
  const matches = findPossibleDuplicateArticles(
    "Prefeitura anuncia nova UBS no bairro Centro",
    undefined,
    [{ id: "a1", title: "Prefeitura anuncia nova UBS no bairro Centro", status: "published" }],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].articleId, "a1");
  assert.ok(matches[0].score > 0.9);
  assert.equal(matches[0].reason, "title");
});

test("matéria publicada antes da edição impressa também entra na comparação (nenhum filtro de status/data aqui)", () => {
  const matches = findPossibleDuplicateArticles(
    "Câmara aprova novo código de obras",
    undefined,
    [{ id: "a2", title: "Câmara aprova novo código de obras municipal", status: "published" }],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].status, "published");
});

test("títulos sem relação e sem corpo comparável não geram correspondência", () => {
  const matches = findPossibleDuplicateArticles(
    "Festival de inverno terá shows gratuitos",
    undefined,
    [{ id: "a3", title: "Secretaria de saúde amplia horário de vacinação", status: "draft" }],
  );
  assert.equal(matches.length, 0);
});

test("título vazio/ausente e sem corpo nunca gera correspondência (nada para comparar)", () => {
  assert.deepEqual(
    findPossibleDuplicateArticles(undefined, undefined, [{ id: "a4", title: "Qualquer coisa", status: "draft" }]),
    [],
  );
  assert.deepEqual(
    findPossibleDuplicateArticles("   ", undefined, [{ id: "a4", title: "Qualquer coisa", status: "draft" }]),
    [],
  );
});

test("resultado nunca passa de 5 correspondências, ordenado da mais semelhante para a menos", () => {
  const articles = Array.from({ length: 10 }, (_, i) => ({
    id: `art-${i}`,
    title: "Prefeitura anuncia nova UBS no bairro Centro",
    status: "published",
  }));
  const matches = findPossibleDuplicateArticles("Prefeitura anuncia nova UBS no bairro Centro", undefined, articles);
  assert.equal(matches.length, 5);
  for (let i = 1; i < matches.length; i += 1) {
    assert.ok(matches[i - 1].score >= matches[i].score);
  }
});

test("título diferente mas CONTEÚDO praticamente igual (mesmo texto de assessoria reaproveitado) é sinalizado como 'content'", () => {
  const body =
    "<p>A prefeitura inaugurou nesta semana a nova unidade básica de saúde do bairro Centro, com investimento de dois milhões de reais em equipamentos modernos para atendimento da população local.</p>";
  const matches = findPossibleDuplicateArticles(
    "Nova unidade de saúde é entregue à população",
    body,
    [
      {
        id: "a5",
        title: "Governo libera recursos para obras na região",
        body,
        status: "published",
      },
    ],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].reason, "content");
});

test("título semelhante e conteúdo semelhante marca 'title_and_content'", () => {
  const body = "<p>Texto de teste com bastante conteúdo compartilhado entre os dois registros comparados aqui.</p>";
  const matches = findPossibleDuplicateArticles(
    "Prefeitura anuncia nova UBS no bairro Centro",
    body,
    [{ id: "a6", title: "Prefeitura anuncia nova UBS no bairro Centro", body, status: "published" }],
  );
  assert.equal(matches[0].reason, "title_and_content");
});

test("corpo com texto totalmente diferente não gera correspondência de conteúdo mesmo com HTML/tags", () => {
  const matches = findPossibleDuplicateArticles(
    undefined,
    "<p>Festival de inverno terá shows gratuitos na praça central da cidade neste fim de semana.</p>",
    [
      {
        id: "a7",
        title: "Outro assunto qualquer",
        body: "<p>Secretaria de saúde amplia horário de vacinação contra a gripe nas unidades municipais.</p>",
        status: "draft",
      },
    ],
  );
  assert.equal(matches.length, 0);
});
