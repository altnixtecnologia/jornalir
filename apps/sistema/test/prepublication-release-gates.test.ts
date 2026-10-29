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

test("rota fiscal (emissão) e menus respeitam bloqueio — configuração fica liberada só pra admin/owner", () => {
  const middleware = source("middleware.ts");
  // Emissão (rascunhos/notas/perfis-servico/nova) continua barrada por URL pra todo mundo.
  assert.match(middleware, /!NFSE_AVAILABLE_IN_THIS_RELEASE && matches\("\/sistema\/nfse"\) && !isNfseConfigPath/);
  // /sistema/nfse/configuracoes só é liberada quando `privileged` (owner/admin); demais perfis continuam bloqueados.
  assert.match(middleware, /!NFSE_AVAILABLE_IN_THIS_RELEASE && isNfseConfigPath && !privileged/);

  const checkModuleAction = source("lib/permissions/checkModuleAction.ts");
  // Toda Server Action de NFS-e continua bloqueada, EXCETO "configuracoes_gerenciar" (cadastro fiscal/certificado).
  assert.match(checkModuleAction, /module === "nfse" && action !== "configuracoes_gerenciar" && !NFSE_AVAILABLE_IN_THIS_RELEASE/);

  assert.match(source("components/admin/AdminHeader.tsx"), /NFSE_AVAILABLE_IN_THIS_RELEASE && canManageUsers/);
  const mobileNav = source("components/admin/MobileNav.tsx");
  assert.match(mobileNav, /NFSE_AVAILABLE_IN_THIS_RELEASE/);
  // Enquanto a emissão estiver adiada, o menu mobile mostra só o link de configuração (nunca rascunhos/notas/perfis-servico).
  assert.match(mobileNav, /label: "Configurações", href: "\/sistema\/nfse\/configuracoes"/);
});

test("certificado A1 (upload/consulta local) libera admin/owner sem abrir chamada fiscal externa", () => {
  const cert = source("app/sistema/nfse/configuracoes/certificado-actions.ts");
  const municipality = source("app/sistema/nfse/configuracoes/parametrizacao-actions.ts");
  // Upload/consulta do certificado nunca fazem chamada externa — não dependem mais do gate de release,
  // só da checagem de papel (requireFiscalAdmin), reconferida no banco a cada chamada.
  assert.ok(!cert.includes('from "../../../../lib/release/releasePolicy"'), "certificado-actions.ts não deve mais importar o gate de release");
  const requireFiscalAdminCalls = cert.match(/await requireFiscalAdmin\(client\)/g) ?? [];
  assert.equal(requireFiscalAdminCalls.length, 2, "uploadCertificateAction e getActiveCertificateAction devem reconferir o papel no banco");
  // A consulta real de parâmetros municipais (chamada mTLS ao ADN) continua bloqueada, sem exceção.
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
