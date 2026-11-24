import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

function source(relative:string):string {
  return readFileSync(new URL("../src/"+relative,import.meta.url),"utf8");
}
test("Usuários só renderiza após autorização administrativa revalidada no servidor",()=>{
  const src=source("app/sistema/usuarios/page.tsx");
  const serverGuard=src.indexOf('client.rpc("is_active_admin_or_owner")');
  const render=src.indexOf("<UsersManager />");
  assert.ok(src.includes("auth.getUser()"));
  assert.ok(serverGuard>=0 && serverGuard<render);
  assert.match(src,/grantError \|\| allowed !== true\) notFound\(\)/);
  assert.match(src,/export const dynamic = "force-dynamic"/);
});
test("Configuração do Asaas exige administração mesmo em acesso por URL direta",()=>{
  const page=source("app/sistema/configuracoes/cobrancas/page.tsx");
  const guard=page.indexOf('client.rpc("is_active_admin_or_owner")');
  const lookup=page.indexOf('.from("billing_provider_settings")');
  assert.ok(guard>=0 && lookup>guard);
  assert.match(page,/grantError \|\| allowed !== true\) notFound\(\)/);
});
test("Ações Asaas não usam chave, chamada externa nem banco antes do guard administrativo",()=>{
  const src=source("app/sistema/configuracoes/cobrancas/actions.ts");
  const actions=[
    ["updateBillingProviderSettingsAction","testAsaasConnectionAction"],
    ["testAsaasConnectionAction","interface AsaasWebhookRecord"],
    ["provisionAsaasWebhookAction",null],
  ] as const;
  for(const [name,next] of actions){
    const begin=src.indexOf("export async function "+name);
    assert.ok(begin>=0,name+" deve existir");
    const end=next ? src.indexOf(next,begin+12) : src.length;
    const body=src.slice(begin,end>=0?end:src.length);
    const guard=body.indexOf("await requireBillingSettingsAdmin()");
    assert.ok(guard>=0,name+" exige o guard");
    for(const risky of ["getAsaasApiKey(", "getConfiguredAsaasEnvironment(", "fetch(", "asaasConfigurationRequest(", '.from("billing_provider_settings")']){
      const index=body.indexOf(risky);
      if(index>=0)assert.ok(index>guard,name+" não pode executar "+risky+" antes da autorização");
    }
  }
  assert.match(src,/client\.rpc\("is_active_admin_or_owner"\)/);
});
test("Concessão financeira crítica individual abre confirmação antes de entrar no rascunho",()=>{
  const src=source("features/usuarios/UsersManager.tsx");
  const start=src.indexOf("function updateFinanceAction(");
  const end=src.indexOf("function handleSelectAllModule(",start);
  const body=src.slice(start,end);
  assert.match(body,/financeActionNeedsConfirmation\(actionKey, allowed\)/);
  assert.match(body,/setCriticalConfirm\(\{ scope: "singleFinance"/);
  const confirm=src.slice(src.indexOf("function confirmCriticalSelection("),src.indexOf("function handleActivateDefaultModules("));
  assert.match(confirm,/criticalConfirm\.scope === "singleFinance"/);
  assert.match(confirm,/financeActions: \{ \.\.\.permissionDraft\.financeActions, \[criticalConfirm\.actionKey\]: true \}/);
  assert.match(src,/confirmLabel=\{criticalConfirm\?\.scope === "single" \|\| criticalConfirm\?\.scope === "singleFinance"/);
});
