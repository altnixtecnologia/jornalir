import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recordAdminRoute, resolveAdminBackFallback } from "../src/lib/adminBackNavigation";

const source = (path: string) => readFileSync(
  new URL(`../src/${path}`, import.meta.url), "utf8",
);

test("Voltar: navegação normal do painel cria pilha interna e histórico real a reduz", () => {
  let routes: string[] = [];
  routes = recordAdminRoute(routes, "/sistema", false);
  routes = recordAdminRoute(routes, "/sistema/nfse", false);
  routes = recordAdminRoute(routes, "/sistema/nfse/nova", false);
  routes = recordAdminRoute(routes, "/sistema/nfse/nova", false);
  assert.deepEqual(routes, ["/sistema", "/sistema/nfse", "/sistema/nfse/nova"]);
  routes = recordAdminRoute(routes, "/sistema/nfse", true);
  assert.deepEqual(routes, ["/sistema", "/sistema/nfse"]);
  routes = recordAdminRoute(routes, "/sistema/nfse/nova", false);
  assert.deepEqual(routes, ["/sistema", "/sistema/nfse", "/sistema/nfse/nova"]);
});

test("Voltar: link direto ou refresh sempre usa destino seguro dentro do sistema", () => {
  assert.equal(resolveAdminBackFallback("/sistema"), "/sistema");
  assert.equal(resolveAdminBackFallback("/site/noticias"), "/sistema");
  assert.equal(resolveAdminBackFallback("/sistema/nfse"), "/sistema");
  assert.equal(resolveAdminBackFallback("/sistema/nfse/nova"), "/sistema/nfse");
  assert.equal(resolveAdminBackFallback("/sistema/nfse/configuracoes"), "/sistema/nfse");
  assert.equal(resolveAdminBackFallback("/sistema/nfse/perfis-servico"), "/sistema/nfse");
  assert.equal(resolveAdminBackFallback("/sistema/nfse/rascunhos/123"), "/sistema/nfse/rascunhos");
  assert.equal(resolveAdminBackFallback("/sistema/nfse/notas/123"), "/sistema/nfse/notas");
  assert.equal(resolveAdminBackFallback("/sistema/clientes/novo"), "/sistema/clientes");
  assert.equal(resolveAdminBackFallback("/sistema/clientes/123/editar"), "/sistema/clientes/123");
  assert.equal(resolveAdminBackFallback("/sistema/financeiro/contratos/123"), "/sistema/financeiro/contratos");
  assert.equal(resolveAdminBackFallback("/sistema/financeiro/contratos/123/editar"), "/sistema/financeiro/contratos/123");
  assert.equal(resolveAdminBackFallback("/sistema/editorial/importar-pdf"), "/sistema/editorial/materias");
  assert.equal(resolveAdminBackFallback("/sistema/editorial/materias"), "/sistema");
  assert.equal(resolveAdminBackFallback("/sistema/publicidade/propostas"), "/sistema/publicidade");
});

test("Voltar: controle único no AdminShell cobre TODAS as páginas sem copiar botoes por rota", () => {
  const shell = source("components/admin/AdminShell.tsx");
  const control = source("components/admin/AdminBackButton.tsx");
  const layout = readFileSync(new URL("../src/app/sistema/layout.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(layout, /<AdminShell/);
  assert.match(shell, /<AdminBackButton\s*\/>/);
  assert.ok(shell.indexOf("<AdminBackButton />") < shell.indexOf("{children}"));
  assert.match(control, /pathname === "\/sistema"/);
  assert.match(control, /!pathname\.startsWith\("\/sistema\/"\)/);
  assert.match(control, /router\.back\(\)/);
  assert.match(control, /router\.replace\(resolveAdminBackFallback\(pathname\)\)/);
  assert.match(control, /routeStackRef\.current = \[\]/);
  assert.match(control, /dialog\[open\]/);
  assert.match(control, /aria-label="Voltar à página anterior"/);
  assert.match(css, /\.admin-back-row/);
  assert.match(css, /\.admin-global-back-arrow/);
  assert.doesNotMatch(control, /window\.history\.go\(-\d+\)/);
});

test("NFS-e: formulário tem Anterior/Próxima e mantém abas montadas com dados", () => {
  const tabs = source("components/admin/Tabs.tsx");
  const form = source("features/nfse/NfseDraftForm.tsx");
  const navigation = source("lib/navigation.ts");
  assert.match(tabs, /showStepNavigation = false/);
  assert.match(tabs, /aria-label="Voltar à etapa anterior"/);
  assert.match(tabs, /aria-label="Avançar à próxima etapa"/);
  assert.match(tabs, /Etapa \{activeIndex \+ 1\} de \{tabs\.length\}/);
  assert.match(tabs, /hidden=\{activeId !== tab\.id\}/);
  assert.match(form, /<Tabs tabs=\{tabs\} showStepNavigation\s*\/>/);
  assert.match(navigation, /Nova NFS-e \(rascunho\).*?\/sistema\/nfse\/nova/);
  assert.match(navigation, /NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE/);
});
