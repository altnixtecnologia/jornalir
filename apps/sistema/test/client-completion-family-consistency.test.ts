import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

function load(path:string) {
  return readFileSync(new URL(path,import.meta.url),"utf8");
}
const migration=load("../../../supabase/migrations/20261124130000_client_completion_family_empty_consistency.sql");
const original=load("../../../supabase/migrations/20261120310000_client_completion_public_flow.sql");
const form=load("../src/features/clientes/ClientCompletionWizard.tsx");

test("migração nova não reescreve a anterior e preserva guarda OTP e consentimento",()=>{
  assert.match(original,/family_members_confirmed_empty = true where id = v_client_id/);
  assert.match(migration,/update public\.clients set family_members_confirmed_empty = false where id = v_client_id/);
  assert.match(migration,/require_verified_client_completion\(p_token_sha256, p_auth_user_id\)/);
  assert.match(migration,/case when p_consent then 'granted' else 'pending' end/);
  assert.match(migration,/coalesce\(p_consent, false\)/);
  assert.match(migration,/grant execute on function public\.public_complete_add_family_member[\s\S]*?to service_role/);
  assert.match(migration,/grant execute on function public\.consume_client_completion_token[\s\S]*?to service_role/);
  assert.match(migration,/revoke all on function public\.consume_client_completion_token[\s\S]*?from public, anon, authenticated/);
});
test("autosave/finalizar nunca confirma vazio com familiares ativos",()=>{
  assert.match(migration,/when exists \(\s*select 1 from public\.birthday_entries b[\s\S]*?b\.active\s*\) then false/);
  assert.match(migration,/else coalesce\(\(p_updates->>'family_members_confirmed_empty'\)::boolean, family_members_confirmed_empty\)/);
});
test("interface limpa confirmação ao inserir familiar e nunca repassa confirmação incompatível",()=>{
  assert.match(form,/setConfirmedNoFamily\(snapshot\.familyMembers\.length === 0 && snapshot\.familyMembersConfirmedEmpty\)/);
  const add=form.slice(form.indexOf("function addFamilyMember()"),form.indexOf("function addRelatedPerson()"));
  assert.match(add,/setConfirmedNoFamily\(false\)/);
  assert.doesNotMatch(add,/setConfirmedNoFamily\(true\)/);
  assert.match(form,/family_members_confirmed_empty: snapshot\.familyMembers\.length === 0 && confirmedNoFamily \? true : undefined/);
});
