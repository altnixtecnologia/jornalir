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

test("publicação não habilita NFS-e; leitura cadastral Altnix liberada só atrás de ambiente, segredo e seleção individual", () => {
  assert.equal(NFSE_AVAILABLE_IN_THIS_RELEASE, false);
  // Leitura cadastral autenticada liberada pelo proprietário (commit 55edd508, 26/11/2026). Escrita continua fora do contrato.
  assert.equal(ALTNIX_CLIENT_EXPORT_RELEASED, true);
  const remoteRoute = source("app/api/integrations/altnix/clients/route.ts");
  assert.ok(remoteRoute.includes('process.env.VERCEL_ENV !== "production" || process.env.ALTNIX_CLIENT_SYNC_ENABLED !== "true"'), "exige produção e flag de ambiente");
  assert.ok(remoteRoute.includes('if (!secretValid(request)) return respond({ error: "Não autorizado." }, 401)'), "exige segredo servidor-a-servidor");
  assert.ok(remoteRoute.includes('client_digital_export_permissions.enabled", true)'), "seleção só de clientes individualmente aprovados");
  assert.doesNotMatch(remoteRoute, /export async function (POST|PUT|PATCH|DELETE)/, "rota continua somente leitura");
  assert.match(NFSE_POSTPONED_MESSAGE, /posterior/);
  assert.equal(adminModules.find((module) => module.slug === "nfse")?.planned, false, "preparacao interna disponivel, transmissao fiscal bloqueada");
});

test("rota fiscal (emissão) e menus respeitam bloqueio — configuração fica liberada só pra admin/owner", () => {
  const middleware = source("middleware.ts");
  // Navegacao preparatoria so para owner/admin, sem liberar a emissao fiscal real.
  assert.match(middleware, /matches\("\/sistema\/nfse"\) && !NFSE_AVAILABLE_IN_THIS_RELEASE/);
  // /sistema/nfse/configuracoes só é liberada quando `privileged` (owner/admin); demais perfis continuam bloqueados.
  assert.match(middleware, /!privileged \|\| \(!NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE && !isNfseConfigPath\)/);

  const checkModuleAction = source("lib/permissions/checkModuleAction.ts");
  // Server Actions so permitem preparacao a owner/admin. Emissao sempre bloqueada.
  assert.match(checkModuleAction, /isNfsePreparationAction\(action\)/);
  assert.match(checkModuleAction, /profile\.role !== "owner" && profile\.role !== "admin"/);

  assert.match(source("components/admin/AdminHeader.tsx"), /NFSE_AVAILABLE_IN_THIS_RELEASE \|\| NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE/);
  const mobileNav = source("components/admin/MobileNav.tsx");
  assert.match(mobileNav, /NFSE_AVAILABLE_IN_THIS_RELEASE/);
  // Menu mobile mostra a preparacao a owner/admin, com a emissao bloqueada pelo servidor.
  assert.match(mobileNav, /NFSE_AVAILABLE_IN_THIS_RELEASE \|\| NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE/);
});

test("composição oficial da NFS-e nunca injeta o provider que envia à SEFIN", () => {
  const composition = source("composition/nfse.ts");
  // Se a composição oficial for substituída pelo adaptador de integração
  // usado nos testes, não há mais garantia de bloqueio do release.
  assert.match(
    composition,
    /createTransmissionAttemptRepositorySupabase\(client\),\s*new FetchNationalNfseProvider\(\),\s*getCertificateService\(\)/,
  );
  assert.doesNotMatch(composition, /new SefinNacionalNationalNfseProvider\(/);
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
