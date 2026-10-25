import test from "node:test";
import assert from "node:assert/strict";
import { inspectMigrationLedger } from "./migration-preflight.mjs";

test("versão e nome idênticos são os únicos equivalentes automáticos", () => {
  const result=inspectMigrationLedger(["20261001120000_create_clients.sql"],[
    {version:"20261001120000",name:"create_clients"}]);
  assert.equal(result.matchedCount,1);
  assert.equal(result.possibleRenamed.length,0);
  assert.equal(result.safeToAutoApply,false);
});
test("migration já aplicada com versão diferente impede publicação mesmo com nome igual", () => {
  const result=inspectMigrationLedger([
    "20261021180000_localities_state_code_for_geotargeting.sql",
    "20261021190000_native_push_geographic_routing.sql",
  ],[
    {version:"20261021220137",name:"localities_state_code_for_geotargeting"},
    {version:"20261021220149",name:"native_push_geographic_routing"},
  ]);
  assert.equal(result.missingInGit.length,2);
  assert.equal(result.notApplied.length,2);
  assert.equal(result.possibleRenamed.length,2);
  assert.match(result.verdict,/NO-GO/);
});
test("migration desconhecida somente no Git também exige backup e aprovação", () => {
  const x=inspectMigrationLedger(["20261001120000_create_clients.sql"],[]);
  assert.equal(x.notApplied.length,1);
  assert.match(x.verdict,/NO-GO/);
});
test("mesma versão com nome diferente ou versões duplicadas: bloquear", () => {
  const changed=inspectMigrationLedger(["20261001120000_create_clients.sql"],[
    {version:"20261001120000",name:"create_tenants"}]);
  assert.equal(changed.differentName.length,1);
  const repeated=inspectMigrationLedger(
    ["20261001120000_create_clients.sql","20261001120000_create_users.sql"],[]);
  assert.deepEqual(repeated.localDuplicates,["20261001120000"]);
});
test("entradas inválidas são rejeitadas; não aceitar nomes arbitrários", () => {
  assert.throws(()=>inspectMigrationLedger(["../../outside.sql"],[]),/inválido/);
  assert.throws(()=>inspectMigrationLedger([], [{version:"bad",name:"migration"}]),/inválido/);
  assert.throws(()=>inspectMigrationLedger([], {migrations:[]}),/lista remota/);
});
