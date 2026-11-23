import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

function app(path: string): string {
  return readFileSync(new URL("../src/"+path, import.meta.url), "utf8");
}
test("incluir familiar desfaz confirmação anterior de família vazia, sem liberar publicação",()=>{
  const actions=app("app/sistema/clientes/complementacao-actions.ts");
  const fragment=actions.slice(actions.indexOf("export async function addFamilyMemberAction("),actions.indexOf("export async function deactivateFamilyMemberAction("));
  assert.match(fragment,/family_members_confirmed_empty: false/);
  assert.doesNotMatch(fragment,/family_members_confirmed_empty: true/);
  assert.match(fragment,/origin: "familiar"/);
  assert.doesNotMatch(fragment,/publish_in_print:\s*true/);
  const ui=app("features/clientes/FamilyAndRelatedPersonsControl.tsx");
  const add=ui.slice(ui.indexOf("function submitFamilyMember()"),ui.indexOf("function removeFamilyMember("));
  assert.match(add,/setConfirmedEmpty\(false\)/);
});
test("link mostra URL pública completa e nunca dispara mensagem automaticamente",()=>{
  const ui=app("features/clientes/CompletionLinkControl.tsx");
  assert.match(ui,/new URL\(result\.urlPath, "https:\/\/controle\.altnix\.com\.br"\)\.href/);
  assert.match(ui,/value=\{generatedUrl\}/);
  assert.doesNotMatch(ui,/Caminho gerado \(ainda sem página pública/);
  assert.doesNotMatch(ui,/sendWhatsapp|sendEmail|fetch\(/);
  const actions=app("app/sistema/clientes/complementacao-actions.ts");
  assert.match(actions,/generate_client_completion_token/);
  assert.match(actions,/p_channel: channel/);
  assert.match(actions,/urlPath: `\/complementar-cadastro\/\$\{data\}`/);
  const publicPage=app("app/complementar-cadastro/[token]/page.tsx");
  assert.match(publicPage,/ClientCompletionWizard/);
});
