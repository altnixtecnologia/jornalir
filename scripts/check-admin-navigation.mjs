#!/usr/bin/env node
/**
 * Lightweight static safety check: menu = destinations, create buttons = module pages.
 * Run with: node scripts/check-admin-navigation.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname || process.cwd());
const contents = (path) => readFileSync(resolve(root, path), "utf8");
const nav = contents("apps/sistema/src/lib/navigation.ts");
const mobile = contents("apps/sistema/src/components/admin/MobileNav.tsx");
const home = contents("apps/sistema/src/app/sistema/page.tsx");
const hrefs = [...nav.matchAll(/href:\s*["']([^"']+)["']/g)].map(m=>m[1]);
const newRoutes = hrefs.filter(url=>/\/(?:nova|novo)$/.test(url));
if (newRoutes.length) throw new Error("Ações de criação indevidas no menu: " + newRoutes.join(", "));
if (/\{ label: ["']Nova matéria["']/.test(mobile)) throw new Error("Atalho de criação duplicado no menu mobile.");
if (/\{ label: ["']Nova matéria["']/.test(home)) throw new Error("Atalho de criação duplicado na home.");
const mustHaveAction = [
  "apps/sistema/src/app/sistema/assinaturas/page.tsx",
  "apps/sistema/src/app/sistema/clientes/page.tsx",
  "apps/sistema/src/app/sistema/editorial/materias/page.tsx",
  "apps/sistema/src/app/sistema/financeiro/contas-a-receber/page.tsx",
  "apps/sistema/src/app/sistema/financeiro/contratos/page.tsx",
  "apps/sistema/src/app/sistema/publicidade/propostas/page.tsx",
  "apps/sistema/src/app/sistema/publicidade/vendas/page.tsx",
];
for (const file of mustHaveAction) {
  const source = contents(file);
  if (!/href=["'{`][^\n]{0,130}\/(?:nova|novo)/.test(source)) throw new Error("Falta CTA na listagem: "+file);
}
console.log("Menu limpo e ações de criação presentes nos módulos (7 listagens).");
