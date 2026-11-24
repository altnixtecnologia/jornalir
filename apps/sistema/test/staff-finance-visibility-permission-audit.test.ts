import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {describeEvent,moduleLabel} from "../src/features/auditoria/auditEventPresentation";

const source=readFileSync(new URL("../../../supabase/migrations/20261124174932_audit_finance_and_visibility_permissions_20261124.sql",import.meta.url),"utf8");
test("migração acrescenta auditoria para APENAS os 2 grupos ainda não cobertos",()=>{
  assert.match(source,/create trigger staff_finance_action_permissions_audit/);
  assert.match(source,/create trigger staff_module_visibility_audit/);
  assert.doesNotMatch(source,/drop trigger[^;]*staff_module_action_permissions_audit/);
  assert.match(source,/after insert or update of allowed on public\.staff_finance_action_permissions/);
  assert.match(source,/after insert or update of enabled on public\.staff_module_visibility/);
});
test("auditoria ignora upsert idempotente, grava antes/depois e pessoa verdadeira quando houver",()=>{
  assert.match(source,/if v_prior is not distinct from v_next then\s*return new;/);
  assert.match(source,/user_id, entity_type, entity_id, action, metadata/);
  assert.match(source,/auth\.uid\(\)/);
  assert.match(source,/new\.profile_id/);
  assert.match(source,/'previous_allowed', v_prior/);
  assert.match(source,/'allowed', v_next/);
  assert.match(source,/new\.action_key in \('recebimentos_estornar', 'pix_cancelar'\)/);
  assert.match(source,/security definer\s*set search_path = ''/);
  assert.match(source,/revoke all on function public\.audit_staff_finance_or_visibility_permission_change\(\)[\s\S]*?from public, anon, authenticated/);
});
test("Auditoria e Atividades reconhece concessões e revogações em português",()=>{
  assert.equal(moduleLabel("staff_permission"),"Usuários e permissões");
  const row={
    id:"00000000-0000-4000-8000-000000000000",
    userId:null,
    responsibleName:null,
    entityType:"staff_permission",
    entityId:"00000000-0000-4000-8000-000000000000",
    action:"grant",
    metadata:{module_key:"financeiro",action_key:"pix_cancelar",previous_allowed:false,allowed:true},
    createdAt:"2026-11-24T12:00:00Z",
  };
  assert.match(describeEvent(row as Parameters<typeof describeEvent>[0]),/Permissão.*concedida/);
});
