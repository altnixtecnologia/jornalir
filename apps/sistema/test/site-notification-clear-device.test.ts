import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const route=read("../src/app/api/public/notifications/route.ts");
const context=read("../../site/src/components/site/public/notifications/NotificationCenterContext.tsx");
const panel=read("../../site/src/components/site/public/notifications/NotificationPanel.tsx");
const migration=read("../../../supabase/migrations/20261124174937_site_notifications_dismissed_per_device_20261124.sql");

test("limpeza reaproveita estado do leitor, sem apagar avisos compartilhados",()=>{
  assert.match(migration,/alter table public\.site_notification_reads/);
  assert.match(migration,/add column if not exists dismissed_at timestamptz/);
  assert.doesNotMatch(migration,/delete from|drop table/i);
  const branch=route.slice(route.indexOf("if (body.clear === true)"),route.indexOf('if (typeof body.eventId'));
  assert.match(branch,/allowedKindsFor\(db, body\.managementToken\)/);
  assert.match(branch,/\.eq\("app_kind", "site"\)/);
  assert.match(branch,/\.lte\("scheduled_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(branch,/management_hash: hash, event_id: eventId, read_at: now, dismissed_at: now/);
  assert.match(branch,/onConflict: "management_hash,event_id"/);
  assert.doesNotMatch(branch,/\.delete\(/);
});
test("GET oculta só o que foi limpo por este token e preserva leitura antiga até migrar",()=>{
  assert.match(route,/\.select\("event_id,dismissed_at"\)/);
  assert.match(route,/\.eq\("management_hash", hash\)/);
  assert.match(route,/visible\.filter\(\(event\) => !dismissedIds\.has/);
  assert.match(route,/isMissingColumn\(result\.error\)/);
  assert.match(route,/clearAvailable = false/);
});
test("estado do portal não some antes do servidor confirmar limpeza",()=>{
  assert.match(panel,/aria-label="Limpar notificações deste dispositivo"/);
  assert.match(panel,/const ok = await clearNotifications\(\)/);
  assert.match(context,/body: JSON\.stringify\(\{ managementToken: token, clear: true \}\)/);
  assert.match(context,/if \(result\.ok !== true\) return false/);
  assert.match(context,/setItems\(\(current\) => current\.filter/);
  assert.match(context,/const token = getOrCreateManagementToken\(\)/);
});
