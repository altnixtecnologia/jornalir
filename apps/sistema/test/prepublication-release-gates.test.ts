import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NFSE_AVAILABLE_IN_THIS_RELEASE, NFSE_POSTPONED_MESSAGE } from "../src/lib/release/releasePolicy";
import { ALTNIX_CLIENT_EXPORT_RELEASED } from "../src/lib/integrations/altnixDigitalClientContract";
import { adminModules } from "../src/lib/navigation";
import { canUseSupabaseAdminCredentials } from "../src/lib/release/previewIsolationPolicy";

function source(path: string): string {
  return readFileSync(new URL("../src/" + path, import.meta.url), "utf8");
}

test("primeira publicação não habilita NFS-e nem Altnix por flag/segredo", () => {
  assert.equal(NFSE_AVAILABLE_IN_THIS_RELEASE, false);
  assert.equal(ALTNIX_CLIENT_EXPORT_RELEASED, false);
  assert.match(NFSE_POSTPONED_MESSAGE, /posterior/);
  assert.equal(adminModules.find((module) => module.slug === "nfse")?.planned, true);
});

test("rota fiscal, menus e autorização de Server Actions respeitam bloqueio", () => {
  assert.match(source("middleware.ts"), /!NFSE_AVAILABLE_IN_THIS_RELEASE && matches\("\/sistema\/nfse"\)/);
  assert.match(source("lib/permissions/checkModuleAction.ts"), /module === "nfse" && !NFSE_AVAILABLE_IN_THIS_RELEASE/);
  assert.match(source("components/admin/AdminHeader.tsx"), /NFSE_AVAILABLE_IN_THIS_RELEASE && canManageUsers/);
  assert.match(source("components/admin/MobileNav.tsx"), /NFSE_AVAILABLE_IN_THIS_RELEASE/);
});

test("canais fiscais que não usam o gate geral também param antes de executar", () => {
  const cert = source("app/sistema/nfse/configuracoes/certificado-actions.ts");
  const municipality = source("app/sistema/nfse/configuracoes/parametrizacao-actions.ts");
  assert.match(cert, /if \(!NFSE_AVAILABLE_IN_THIS_RELEASE\) return \{ error: NFSE_POSTPONED_MESSAGE \}/);
  assert.match(cert, /if \(!NFSE_AVAILABLE_IN_THIS_RELEASE\) return null/);
  assert.match(municipality, /if \(!NFSE_AVAILABLE_IN_THIS_RELEASE\) return \{ ok: false/);
});

test("consulta remota Altnix falha antes de qualquer verificação de secret/ambiente", () => {
  const remote = source("app/api/integrations/altnix/clients/route.ts");
  const gate = remote.indexOf("if (!ALTNIX_CLIENT_EXPORT_RELEASED)");
  const env = remote.indexOf('process.env.ALTNIX_CLIENT_SYNC_ENABLED !== "true"',gate);
  assert.ok(gate >= 0 && env > gate);
});

test("service_role não pode ser utilizada em Preview, Staging ou Development da Vercel", () => {
  assert.equal(canUseSupabaseAdminCredentials("preview"), false);
  assert.equal(canUseSupabaseAdminCredentials("staging"), false);
  assert.equal(canUseSupabaseAdminCredentials("development"), false);
  assert.equal(canUseSupabaseAdminCredentials("production"), true);
  assert.equal(canUseSupabaseAdminCredentials(undefined), true); // Dev local controlado.
  // Teste de regressão: os dois caminhos de Admin API consultam a proteção,
  // e não basta ocultar o botão do cliente.
  const admin = source("lib/supabase/admin.ts");
  assert.match(admin, /return canUseSupabaseAdminCredentials\(process\.env\.VERCEL_ENV\)/);
  assert.match(admin, /if \(!canUseSupabaseAdminCredentials\(process\.env\.VERCEL_ENV\)\)/);
});
