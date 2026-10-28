import test from "node:test";
import assert from "node:assert/strict";
import { findManualDuplicateMatch } from "./manual-guard.mjs";

function manualArticle(overrides = {}) {
  return {
    id: "manual-1",
    slug: "lavm-anuncia-mudanca-temporaria-na-presidencia",
    title: "LAVM ANUNCIA MUDANÇA TEMPORÁRIA NA PRESIDÊNCIA",
    dateIso: "2026-10-21",
    normalizedTitle: "lavm anuncia mudanca temporaria na presidencia",
    significantWords: new Set([
      "mampituba", "rafael", "teixeira", "caetano", "administrativo",
      "entidade", "interinamente", "presidencia", "janeiro", "licenca",
    ]),
    ...overrides,
  };
}

test("título, data e conteúdo todos batendo: duplicata confirmada", () => {
  const match = findManualDuplicateMatch(
    {
      title: "LAVM anuncia mudança temporária na presidência",
      dateIso: "2026-10-21",
      bodyText: "A Liga Atlética Vale do Mampituba comunica que Rafael Teixeira Caetano, diretor administrativo da entidade, assume interinamente a presidência até janeiro, durante a licença do titular.",
    },
    [manualArticle()],
  );
  assert.ok(match);
  assert.equal(match.confirmed, true);
  assert.equal(match.signals.titleMatches, true);
  assert.equal(match.signals.dateClose, true);
  assert.equal(match.signals.contentMatches, true);
});

test("título e data batendo, mas conteúdo sem relação: ambíguo, nunca descartado como se fosse o mesmo", () => {
  const match = findManualDuplicateMatch(
    {
      title: "LAVM anuncia mudança temporária na presidência",
      dateIso: "2026-10-21",
      bodyText: "Texto completamente diferente, sobre outro assunto qualquer, sem nenhuma palavra em comum com a matéria cadastrada manualmente no sistema novo.",
    },
    [manualArticle()],
  );
  assert.ok(match);
  assert.equal(match.confirmed, false, "sem conteúdo batendo, não pode ser tratado como confirmado");
  assert.equal(match.signals.titleMatches, true);
  assert.equal(match.signals.dateClose, true);
  assert.equal(match.signals.contentMatches, false);
});

test("mesmo tipo de assunto, acontecimento diferente (outro jogo, outra data fora da janela): não é sinalizado", () => {
  const match = findManualDuplicateMatch(
    {
      title: "Campeonato Municipal de Futebol de Outra Cidade decide finalistas",
      dateIso: "2026-11-05",
      bodyText: "Resultado de outro campeonato municipal, em outra cidade, com outros times e outra data — nada a ver com a matéria manual cadastrada.",
    },
    [manualArticle()],
  );
  assert.equal(match, null, "título diferente e data fora da janela de 1 dia não deveria bater");
});

test("mesma data, título parecido mas sobre acontecimento diferente (times/times diferentes): título não bate, não é sinalizado", () => {
  const match = findManualDuplicateMatch(
    {
      title: "Prefeitura anuncia mudança temporária no horário de atendimento",
      dateIso: "2026-10-21",
      bodyText: "A prefeitura informa que o horário de atendimento ao público será temporariamente alterado a partir desta semana.",
    },
    [manualArticle()],
  );
  assert.equal(match, null, "título normalizado não contém nem é contido pelo título manual — não deve ser tratado como o mesmo assunto só por data e uma palavra em comum");
});

test("data com até 4 dias de diferença ainda conta como próxima (caso real: manual cadastrada depois do acontecimento); 5 dias não", () => {
  const near = findManualDuplicateMatch(
    { title: "LAVM anuncia mudança temporária na presidência", dateIso: "2026-10-25", bodyText: "" },
    [manualArticle()],
  );
  assert.ok(near, "4 dias de diferença deveria contar como data próxima");

  const far = findManualDuplicateMatch(
    { title: "LAVM anuncia mudança temporária na presidência", dateIso: "2026-10-26", bodyText: "" },
    [manualArticle()],
  );
  assert.equal(far, null, "5 dias de diferença não deveria contar como data próxima");
});

test("caso real do preflight de 28/10/2026: título idêntico, conteúdo batendo, gap de 2 dias entre data de cadastro manual e data real do legado — confirmado", () => {
  const match = findManualDuplicateMatch(
    {
      title: "GOVERNO DO ESTADO ASSUME GESTÃO DO HOSPITAL NOSSA SENHORA DOS NAVEGANTES, EM TORRES",
      dateIso: "2026-10-21",
      bodyText: "Na manhã desta quarta-feira, o prefeito de Torres, Delci Dimer, a secretária municipal de Saúde, Claudia Morel, e o procurador João Pedro Coelho acompanharam a secretária estadual da Saúde, Arita Bergmann.",
    },
    [manualArticle({
      id: "manual-hospital",
      slug: "governo-do-estado-assume-gestao-do-hospital-nossa-senhora-dos-navegantes-em-torres",
      title: "GOVERNO DO ESTADO ASSUME GESTÃO DO HOSPITAL NOSSA SENHORA DOS NAVEGANTES, EM TORRES",
      dateIso: "2026-10-23",
      normalizedTitle: "governo do estado assume gestao do hospital nossa senhora dos navegantes, em torres",
      significantWords: new Set(["torres", "prefeito", "delci", "dimer", "secretaria", "claudia", "morel", "procurador", "joao", "pedro", "coelho", "estadual", "arita", "bergmann"]),
    })],
  );
  assert.ok(match);
  assert.equal(match.confirmed, true);
});

test("sem data (dateIso vazio) nunca é comparado — nunca lança erro", () => {
  assert.equal(findManualDuplicateMatch({ title: "qualquer coisa", dateIso: null, bodyText: "" }, [manualArticle()]), null);
});

test("lista de matérias manuais vazia: nunca sinaliza nada", () => {
  assert.equal(findManualDuplicateMatch({ title: "LAVM anuncia mudança temporária na presidência", dateIso: "2026-10-21", bodyText: "qualquer" }, []), null);
});
