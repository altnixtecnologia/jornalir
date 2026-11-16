import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  birthdayCreateHref,
  resolveBirthdayCreateGroupId,
} from "../src/features/aniversariantes/birthdayDeepLink";

const clientId = "11111111-1111-4111-8111-111111111111";
const anotherId = "22222222-2222-4222-8222-222222222222";
const src = (path: string) => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");

test("Cadastros: link de novo aniversariante mantém contexto do cliente", () => {
  const url = birthdayCreateHref(clientId);
  const parsed = new URL(url, "https://controle.example.test");
  assert.equal(parsed.pathname, "/sistema/aniversariantes");
  assert.equal(parsed.searchParams.get("novo"), "1");
  assert.equal(parsed.searchParams.get("cliente"), clientId);
});

test("Aniversariantes: só pré-seleciona grupo ativo carregado pelo servidor", () => {
  assert.equal(
    resolveBirthdayCreateGroupId({ novo: "1", cliente: clientId }, [clientId]),
    clientId,
  );
  for (const query of [
    { novo: "0", cliente: clientId },
    { novo: "1", cliente: anotherId },
    { novo: "1", cliente: "javascript:alert(1)" },
    { novo: "1", cliente: "/sistema/clientes" },
    { novo: "1", cliente: "" },
    undefined,
  ]) {
    assert.equal(resolveBirthdayCreateGroupId(query, [clientId]), "");
  }
});

test("Cadastro: botões distintos para aniversariante editorial e vínculo administrativo", () => {
  const form = src("features/clientes/ClientForm.tsx");
  const related = src("features/clientes/FamilyAndRelatedPersonsControl.tsx");
  assert.match(form, /Cadastrar aniversariante vinculado/);
  assert.match(form, /href=\{birthdayCreateHref\(client.id\)\}/);
  assert.match(form, /#pessoas-vinculadas/);
  assert.match(form, /Gerenciar pessoas vinculadas na ficha/);
  assert.match(related, /<section id="pessoas-vinculadas"/);
  assert.equal((related.match(/id="pessoas-vinculadas"/g) ?? []).length, 2);
  assert.match(related, /scrollMarginTop: "96px"/);
});

test("Aniversariantes: abre modal com cliente pré-selecionado, mas nunca ativa publicação", () => {
  const page = src("app/sistema/aniversariantes/page.tsx");
  const list = src("features/aniversariantes/BirthdaysList.tsx");
  assert.match(page, /resolveBirthdayCreateGroupId\(query,groups\.map/);
  assert.match(page, /initialCreateClientId=\{selectedClientId\}/);
  assert.match(list, /useState\(\(\) => Boolean\(initialCreateClientId\)\)/);
  assert.match(list, /initialGroupId=\{initialCreateClientId\}/);
  assert.match(list, /groups\.some\(\(group\) => group\.id === initialGroupId\)/);
  assert.match(list, /const \[publishInPrint, setPublishInPrint\] = useState\(false\)/);
  assert.match(list, /onSubmit=\{async\(linkGroupId,entry\)=>\{/);
});
