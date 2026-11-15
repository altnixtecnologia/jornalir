import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NFSE_AVAILABLE_IN_THIS_RELEASE,
  NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE,
  isNfsePreparationAction,
} from "../src/lib/release/releasePolicy";
import { DANFSE_OFFICIAL_LAYOUT_APPROVED } from "../src/lib/nfse/danfseReleaseGate";

const source = (file: string) =>
  readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("fase de preparacao: configuracao, perfil e rascunhos liberados sem emissao", () => {
  assert.equal(NFSE_AVAILABLE_IN_THIS_RELEASE, false, "emissao nacional permanece bloqueada");
  assert.equal(DANFSE_OFFICIAL_LAYOUT_APPROVED, false, "DANFSe oficial permanece bloqueado");
  assert.equal(NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE, true);
  for (const action of [
    "configuracoes_gerenciar", "perfis_servico_gerenciar",
    "rascunhos_criar", "rascunhos_editar",
  ]) assert.equal(isNfsePreparationAction(action), true, action);
  for (const action of [
    "notas_emitir", "notas_cancelar", "documentos_consultar",
    "documentos_enviar", "qualquer_coisa", "",
  ]) assert.equal(isNfsePreparationAction(action), false, action);
});

test("preparacao oficial permanece autenticada e exclusiva de owner/admin", () => {
  const middleware = source("middleware.ts");
  assert.match(middleware, /canEnterStaffPanel/);
  assert.match(middleware, /!privileged \|\| \(!NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE && !isNfseConfigPath\)/);
  assert.match(middleware, /matches\("\/sistema\/nfse"\)/);
  const checker = source("lib/permissions/checkModuleAction.ts");
  assert.match(checker, /isNfsePreparationAction\(action\)/);
  assert.match(checker, /profile\.role !== "owner" && profile\.role !== "admin"/);
  assert.match(checker, /staff_can_module_action/);
  assert.match(checker, /if \(fiscalPreparation &&/);
});

test("nenhum bypass de transmissao ou simulacao falsa no banco oficial", () => {
  const transmit = source("app/sistema/nfse/rascunhos/[id]/actions.ts");
  const composition = source("composition/nfse.ts");
  const preview = source("lib/auth/localPreview.ts");
  const invoice = source("lib/nfse/deliveryWorker.ts");
  assert.match(transmit, /checkModuleAction\("nfse", "notas_emitir"\)/);
  assert.match(composition, /new FetchNationalNfseProvider\(\)/);
  assert.match(preview, /process\.env\.NODE_ENV === "development" && process\.env\.SYSTEM_LOCAL_PREVIEW === "1"/);
  assert.match(invoice, /NFSE_AVAILABLE_IN_THIS_RELEASE/);
  assert.match(invoice, /NFSE_ARCHIVE_ENABLED/);
  assert.match(invoice, /NFSE_DELIVERY_ENABLED/);
});

test("menus nao exibem mais NFS-e como modulo ficticio ou futuro para owner/admin", () => {
  const navigation = source("lib/navigation.ts");
  const header = source("components/admin/AdminHeader.tsx");
  const mobile = source("components/admin/MobileNav.tsx");
  assert.match(navigation, /planned: !NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE && !NFSE_AVAILABLE_IN_THIS_RELEASE/);
  assert.match(header, /NFSE_AVAILABLE_IN_THIS_RELEASE \|\| NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE/);
  assert.match(header, /canManageUsers/);
  assert.match(mobile, /restricted: true/);
  assert.match(mobile, /NFSE_AVAILABLE_IN_THIS_RELEASE \|\| NFSE_PREPARATION_ACCESS_IN_THIS_RELEASE/);
});

test("implantacao guiada fiscal usa registros reais e nao confunde cadastro com emissao", () => {
  const overview = source("app/sistema/nfse/page.tsx");
  assert.match(overview, /Implantação do módulo/);
  assert.match(overview, /setupSteps\.filter\(\(step\) => step\.done\)/);
  assert.match(overview, /Boolean\(issuerConfig\)/);
  assert.match(overview, /profile\.cTribNac\?\.trim\(\)/);
  assert.match(overview, /Boolean\(activeCertificate\) && !readiness\.missing\.some/);
  assert.match(overview, /drafts\.length > 0/);
  assert.match(overview, /A emissão fiscal, os envios e o DANFSe definitivo permanecem bloqueados/);
  for (const path of [
    "/sistema/nfse/configuracoes", "/sistema/nfse/perfis-servico",
    "/sistema/nfse/rascunhos", "/sistema/nfse/nova",
  ]) assert.ok(overview.includes(path), path);
});

test("rascunho novo troca cliente sem exibir tomador anterior e limpa codigos de perfil removido", () => {
  const form = source("features/nfse/NfseDraftForm.tsx");
  const selectClient = form.slice(form.indexOf("function handleSelectClient"), form.indexOf("function handleRefreshFromClient"));
  assert.match(selectClient, /setTomador\(emptyTomador\(\)\)/);
  assert.ok(selectClient.indexOf("setTomador(emptyTomador())") < selectClient.indexOf("refreshTomadorSnapshotAction(client.id)"));
  const profileSelection = form.slice(form.indexOf("function handleSelectServiceProfile"), form.indexOf("function setFiscalField"));
  assert.match(profileSelection, /if \(!profile\)/);
  for (const field of ["cTribNac", "cTribMun", "cNBS", "issqnTaxation", "locationIbgeCode", "cstIbsCbs", "cClassTrib", "cIndOp"]) {
    assert.match(profileSelection, new RegExp(field + ': ""'));
  }
  assert.match(form, /a transmissão fiscal continua bloqueada até a homologação nacional/);
});


test("observações padrão fiscais não são tratadas como notas internas nem aplicadas retroativamente", () => {
  const config = src("features/nfse/NfseIssuerConfigForm.tsx");
  const form = src("features/nfse/NfseDraftForm.tsx");
  const actions = src("app/sistema/nfse/nova/actions.ts");
  const tx = readFileSync(new URL("../../../packages/core/src/nfse/transmission-service.ts", import.meta.url), "utf8");
  const builder = readFileSync(new URL("../../../packages/core/src/nfse/dps-builder.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../../supabase/migrations/20261122341000_nfse_fiscal_observations.sql", import.meta.url), "utf8");
  assert.match(config, /Observações padrão das NFS-e/);
  assert.match(config, /Observações internas da configuração/);
  assert.match(form, /initialDraft \? initialDraft\.fiscalObservation \?\? "" : issuerConfig\?\.defaultFiscalObservation \?\? ""/);
  assert.match(form, /Observações internas.*não aparecem na NFS-e/);
  assert.match(form, /purchaseOrderNumber/);
  assert.match(actions, /fiscalObservation: input\.fiscalObservation/);
  assert.match(tx, /fiscalObservation: draft\.fiscalObservation/);
  assert.match(tx, /purchaseOrderNumber: draft\.purchaseOrderNumber/);
  assert.doesNotMatch(builder, /input\.notes/);
  assert.match(migration, /nfse_draft_additional_info_guard/);
  assert.match(migration, /guard_nfse_draft_fiscal_edit/);
});
