import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTIONS = readFileSync(resolve(__dirname, "../src/app/sistema/whatsapp/actions.ts"), "utf8");
const BOARD = readFileSync(resolve(__dirname, "../src/features/whatsapp/WhatsappCaseBoard.tsx"), "utf8");
const MIGRATION = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20261120340000_whatsapp_attendance_module.sql"),
  "utf8",
);
const BILLING_PROVIDER = readFileSync(resolve(__dirname, "../src/lib/financeiro/whatsappCloudProvider.ts"), "utf8");

/**
 * Módulo WhatsApp — revisado (03/11/2026): aproveita o WhatsApp normal já em
 * uso (web.whatsapp.com), SEM Cloud API própria para o número de
 * atendimento. É só um controle INTERNO de responsável/situação/
 * observações — nunca finge sincronizar mensagens reais do WhatsApp.
 */

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `função ${name} não encontrada`);
  const nextExport = source.indexOf("\nexport async function", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

test("não existe mais provedor dedicado, webhook, parser ou credenciais WHATSAPP_ATTENDANCE_* — nenhum arquivo de código os referencia", () => {
  for (const source of [ACTIONS, BOARD, MIGRATION]) {
    assert.doesNotMatch(source, /WHATSAPP_ATTENDANCE_TOKEN|WHATSAPP_ATTENDANCE_PHONE_NUMBER_ID|WHATSAPP_ATTENDANCE_WEBHOOK_VERIFY_TOKEN/);
    assert.doesNotMatch(source, /sendAttendanceTextMessage|parseIncomingWhatsappMessages|attendanceProvider|incomingMessageParser/);
  }
});

test("a Cloud API de mensagens automáticas (número já existente) continua intocada — não referencia nada do módulo de atendimento", () => {
  assert.doesNotMatch(BILLING_PROVIDER, /WHATSAPP_ATTENDANCE_|whatsapp_attendance_cases/);
});

test("o botão 'Abrir WhatsApp de Atendimento' aponta para web.whatsapp.com em nova aba, aproveitando a sessão já conectada", () => {
  assert.match(BOARD, /href=\{WHATSAPP_WEB_URL\}/);
  assert.match(BOARD, /WHATSAPP_WEB_URL = "https:\/\/web\.whatsapp\.com\/"/);
  assert.match(BOARD, /target="_blank"/);
  assert.match(BOARD, /Abrir WhatsApp de Atendimento/);
});

test("createAttendanceCase e as demais ações exigem a permissão existente 'atendimento_gerenciar' — nenhum cadastro paralelo de funcionários", () => {
  for (const fn of ["createAttendanceCase", "setAttendanceCaseStatus", "assignAttendanceCase", "saveAttendanceCaseNotes"]) {
    const body = extractFunction(ACTIONS, fn);
    assert.match(body, /checkModuleAction\("whatsapp", "atendimento_gerenciar"\)/);
  }
  assert.doesNotMatch(ACTIONS, /create table|insert into public\.profiles/i);
});

test("a migration cria só a tabela de controle interno (cases), sem mensagens/webhook/realtime, e referencia profiles (nunca um segundo cadastro)", () => {
  assert.match(MIGRATION, /create table if not exists public\.whatsapp_attendance_cases/);
  assert.doesNotMatch(MIGRATION, /whatsapp_attendance_messages|supabase_realtime/);
  assert.match(MIGRATION, /assigned_to uuid references public\.profiles\(id\)/);
  assert.match(MIGRATION, /created_by uuid references public\.profiles\(id\)/);
});

test("a migration revoga o acesso padrão e concede explicitamente select/insert/update a 'authenticated' — sem o GRANT de tabela, a RLS por si só bloquearia todo mundo", () => {
  assert.match(MIGRATION, /revoke all on public\.whatsapp_attendance_cases from anon, authenticated/);
  assert.match(MIGRATION, /grant select, insert, update on public\.whatsapp_attendance_cases to authenticated/);
});

test("a migration integra ao sistema de permissões existente (staff_module_visibility/staff_module_action_permissions), sem tabela de permissões paralela", () => {
  assert.match(MIGRATION, /staff_module_visibility_module_key_check/);
  assert.match(MIGRATION, /staff_module_actions_known_pair/);
  assert.match(MIGRATION, /'whatsapp'/);
  assert.match(MIGRATION, /'atendimento_gerenciar'/);
});

test("o comentário da migration deixa explícito que não sincroniza mensagens reais do WhatsApp", () => {
  assert.match(MIGRATION, /nunca sincroniza mensagens reais/);
});
