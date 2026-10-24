import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NFSE_AVAILABLE_IN_THIS_RELEASE, NFSE_POSTPONED_MESSAGE } from "../src/lib/release/releasePolicy";
import { ALTNIX_CLIENT_EXPORT_RELEASED } from "../src/lib/integrations/altnixDigitalClientContract";
import { adminModules } from "../src/lib/navigation";
import { canUseSupabaseAdminCredentials, isIsolatedHomologation, PRODUCTION_SUPABASE_REF } from "../src/lib/release/previewIsolationPolicy";

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

test("Preview só obtém service_role com projeto sandbox identificado exatamente", () => {
  const stagingRef = "abcdefghijklmnopqrst";
  const ok = {
    homologationEnabled: "true",
    homologationProjectRef: stagingRef,
    supabaseUrl: `https://${stagingRef}.supabase.co`,
  };
  for (const env of ["preview", "staging", "development", "test"]) {
    assert.equal(canUseSupabaseAdminCredentials(env), false);
  }
  assert.equal(canUseSupabaseAdminCredentials("preview", ok), true);
  assert.equal(canUseSupabaseAdminCredentials("production"), true);
  assert.equal(canUseSupabaseAdminCredentials(undefined), true); // Dev local configurado.
  assert.equal(isIsolatedHomologation({ ...ok, vercelEnv: "preview" }), true);
  for (const bad of [
    { ...ok, homologationEnabled: "false" },
    { ...ok, homologationProjectRef: PRODUCTION_SUPABASE_REF,
      supabaseUrl: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` },
    { ...ok, supabaseUrl: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` },
    { ...ok, supabaseUrl: `http://${stagingRef}.supabase.co` },
    { ...ok, supabaseUrl: `https://${stagingRef}.supabase.co.attacker.invalid` },
    { ...ok, supabaseUrl: `https://${stagingRef}.supabase.co/rest/v1` },
    { ...ok, supabaseUrl: `https://${stagingRef}.supabase.co?token=1` },
    { ...ok, homologationProjectRef: "" },
  ]) assert.equal(canUseSupabaseAdminCredentials("preview", bad), false);
  const admin = source("lib/supabase/admin.ts");
  assert.match(admin, /canUseSupabaseAdminCredentials\(process\.env\.VERCEL_ENV/);
  assert.match(admin, /IR_HOMOLOGATION_SUPABASE_REF/);
  assert.match(admin, /IR_HOMOLOGATION_ENABLED/);
});
