import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ALT-AUD-001 / correção de permissões: estrutura das migrations novas e do sino de notificações.
const root = join(__dirname, "..", "..", "..");
const read = (relative: string): string => readFileSync(join(root, relative), "utf8").replace(/\r\n/g, "\n");

test("pg_cron por minuto só chama a rota com trabalho pendente (mesmo predicado da rota, sem alterar o cron.job)", () => {
  const sql = read("supabase/migrations/20261128100000_cron_invoke_only_with_pending_work.sql");
  assert.doesNotMatch(sql, /cron\.schedule|cron\.unschedule|insert into|update public|delete from/i);
  // edição: mesma regra de claim_newspaper_editions_for_materias_work (queued ou lease de 10 min vencido)
  assert.match(sql, /e\.materias_status = 'queued'/);
  assert.match(sql, /e\.materias_status = 'processing' and e\.materias_started_at is not null/);
  assert.match(sql, /interval '10 minutes'/);
  // agenda: janela de 10 min da rota, com folga de 1 min nas duas pontas, fuso de São Paulo
  assert.match(sql, /America\/Sao_Paulo/);
  assert.match(sql, /e\.status = 'scheduled'/);
  assert.match(sql, /interval '11 minutes'/);
  // a checagem vem ANTES da leitura do segredo e da chamada HTTP
  for (const fn of ["invoke_edition_materias_cron", "invoke_agenda_telegram_cron"]) {
    const body = sql.slice(sql.indexOf(`function public.${fn}`));
    assert.ok(body.indexOf("if not exists") < body.indexOf("vault.decrypted_secrets"), `${fn}: gate antes do Vault`);
    assert.ok(body.indexOf("if not exists") < body.indexOf("net.http_get"), `${fn}: gate antes do HTTP`);
  }
  // o predicado da edição acompanha o claim real
  const claim = read("supabase/migrations/20261121100000_newspaper_edition_unified_online_flow.sql");
  assert.match(claim, /e\.materias_status = 'queued'/);
  assert.match(claim, /e\.materias_started_at < now\(\) - \(p_lease_minutes \|\| ' minutes'\)::interval/);
  const route = read("apps/sistema/src/app/api/cron/edition-materias/route.ts");
  assert.match(route, /p_lease_minutes: 10/);
});

test("migration corretiva de permissões: aditiva, sem conceder nada, com configuracoes e NOT VALID", () => {
  const sql = read("supabase/migrations/20261128090000_staff_module_actions_restore_configuracoes.sql");
  assert.match(sql, /module_key = 'configuracoes' and action_key in \('patrocinadores_gerenciar', 'valores_assine_gerenciar'\)/);
  assert.match(sql, /not valid;/);
  assert.match(sql, /validate constraint staff_module_actions_known_pair/);
  assert.doesNotMatch(sql, /insert into|delete from|update public|create policy|drop policy|alter table .* disable row level security/i);
});

test("sino de notificações: usuário resolvido uma vez e ciclo só com a aba visível", () => {
  const source = read("apps/sistema/src/components/admin/AdminNotificationBell.tsx");
  assert.equal((source.match(/client\.auth\.getUser\(\)/g) ?? []).length, 1, "getUser() uma única vez por montagem");
  assert.match(source, /if \(!mineResolved\)/);
  assert.match(source, /document\.visibilityState === "visible"\) void refresh\(\)/);
  assert.match(source, /removeEventListener\("visibilitychange"/);
});
