import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STAFF_MODULE_ACTIONS } from "../src/lib/permissions/staffPermissionsCatalog";

// Etapa 1 (08/11/2026): permissões, Storage privado, RLS, auditoria e
// governança dos modelos. Segue a convenção do projeto: Server Actions não
// são importadas (dependem de next/headers); o código-fonte e as migrations
// são lidos e as invariantes de segurança, travadas.

const root = join(__dirname, "..", "..", "..");
const read = (relative: string): string => readFileSync(join(root, relative), "utf8");
const migrationsDir = join(root, "supabase", "migrations");

function latestMigrationWith(needle: string): string {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  const hit = [...files].reverse().find((name) => readFileSync(join(migrationsDir, name), "utf8").includes(needle));
  assert.ok(hit, `nenhuma migration contém ${needle}`);
  return readFileSync(join(migrationsDir, hit), "utf8");
}

// ----------------------------------------------------- paridade catálogo × CHECK

test("a CHECK staff_module_actions_known_pair vigente contém EXATAMENTE as ações do catálogo (sem divergência)", () => {
  const sql = latestMigrationWith("add constraint staff_module_actions_known_pair");
  const body = sql.slice(sql.indexOf("add constraint staff_module_actions_known_pair"));
  const fromSql = new Map<string, Set<string>>();
  for (const match of body.matchAll(/module_key = '([a-z_]+)' and action_key in \(([^)]*)\)/g)) {
    fromSql.set(match[1], new Set([...match[2].matchAll(/'([a-z_]+)'/g)].map((item) => item[1])));
  }
  const fromCatalog = new Map<string, Set<string>>();
  for (const action of STAFF_MODULE_ACTIONS) {
    if (!fromCatalog.has(action.module)) fromCatalog.set(action.module, new Set());
    fromCatalog.get(action.module)!.add(action.key);
  }
  assert.deepEqual([...fromSql.keys()].sort(), [...fromCatalog.keys()].sort());
  for (const [module, keys] of fromCatalog) {
    assert.deepEqual([...(fromSql.get(module) ?? [])].sort(), [...keys].sort(), `ações divergentes no módulo ${module}`);
  }
});

test("contratos_assinar: poder individual crítico, nunca padrão, no módulo Comercial", () => {
  const action = STAFF_MODULE_ACTIONS.find((item) => item.key === "contratos_assinar");
  assert.ok(action);
  assert.equal(action.module, "publicidade");
  assert.equal("isDefault" in action && action.isDefault, false);
  assert.equal("adminOnly" in action && action.adminOnly, false);
  assert.equal("isCritical" in action && action.isCritical, true);
});

test("concessão/revogação de permissão é auditada por trigger no banco (atômico), marcando contratos_assinar como crítico", () => {
  const sql = read("supabase/migrations/20261122140000_contract_signing_permission_and_permission_audit.sql");
  assert.match(sql, /create trigger staff_module_action_permissions_audit\s+after insert or update on public\.staff_module_action_permissions/);
  assert.match(sql, /security definer/);
  assert.match(sql, /'staff_permission'/);
  assert.match(sql, /case when v_next then 'grant' else 'revoke' end/);
  assert.match(sql, /contratos_assinar'\)/);
  assert.match(sql, /revoke all on function public\.audit_staff_module_permission_change\(\) from public, anon, authenticated/);
});

// ---------------------------------------------------------------- migrations

const companyMigration = read("supabase/migrations/20261122150000_company_profile_representatives_signature_images.sql");
const governanceMigration = read("supabase/migrations/20261122160000_contract_template_governance.sql");
/** SQL sem comentários de linha — as invariantes valem para o código, não para o texto explicativo. */
const withoutComments = (sql: string): string =>
  sql.split(/\r?\n/).filter((line) => !line.trim().startsWith("--")).join(" ");
const companyCode = withoutComments(companyMigration);
const governanceCode = withoutComments(governanceMigration);

test("PNG privado: bucket signature-images privado, só image/png, 512 KiB, SEM policy em storage.objects; bucket JPEG existente não é alterado", () => {
  assert.match(companyMigration, /'signature-images', 'signature-images', false, 524288, array\['image\/png'\]/);
  assert.doesNotMatch(companyCode, /on storage\.objects/i);
  assert.doesNotMatch(companyCode, /contract-signatures/);
  assert.doesNotMatch(companyCode, /article-media/);
});

test("documento fixo: bucket contract-template-files privado, só PDF, 10 MiB, SEM policy em storage.objects", () => {
  assert.match(governanceMigration, /'contract-template-files', 'contract-template-files', false, 10485760, array\['application\/pdf'\]/);
  assert.doesNotMatch(governanceCode, /on storage\.objects/i);
});

test("RLS ligada nas três tabelas novas; assinatura do funcionário só é legível pelo dono E com a permissão; nenhuma policy de escrita para usuários", () => {
  for (const table of ["company_profile", "company_legal_representatives", "staff_signature_images"]) {
    assert.match(companyMigration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(companyMigration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
  }
  const staffBlock = companyMigration.slice(companyMigration.indexOf("create table public.staff_signature_images"));
  assert.match(staffBlock, /grant select on public\.staff_signature_images to authenticated/);
  assert.match(staffBlock, /profile_id = \(select auth\.uid\(\)\)\s+and public\.staff_can_module_action\('publicidade', 'contratos_assinar'\)/);
  assert.doesNotMatch(staffBlock, /create policy [a-z_]+ on public\.staff_signature_images\s+for (insert|update|delete)/);
});

test("empresa e representantes: escrita só de admin/owner, sem policy de DELETE (desativar em vez de apagar); CNPJ/CPF/UF validados no banco", () => {
  for (const table of ["company_profile", "company_legal_representatives"]) {
    assert.doesNotMatch(companyMigration, new RegExp(`on public\\.${table}\\s+for delete`));
  }
  assert.match(companyMigration, /create policy company_profile_insert on public\.company_profile\s+for insert to authenticated\s+with check \(public\.is_active_admin_or_owner\(\)\)/);
  assert.match(companyMigration, /create policy company_representatives_update on public\.company_legal_representatives\s+for update to authenticated\s+using \(public\.is_active_admin_or_owner\(\)\)/);
  assert.match(companyMigration, /cnpj ~ '\^\[0-9\]\{14\}\$'/);
  assert.match(companyMigration, /cpf ~ '\^\[0-9\]\{11\}\$'/);
  assert.match(companyMigration, /address_state ~ '\^\[A-Z\]\{2\}\$'/);
  assert.match(companyMigration, /create unique index company_legal_representatives_one_default/);
});

test("auditoria de empresa/representante/PNG por trigger, sem gravar PII (só nomes de colunas, hash e tamanho)", () => {
  assert.match(companyMigration, /create trigger company_profile_audit/);
  assert.match(companyMigration, /create trigger company_legal_representatives_audit/);
  assert.match(companyMigration, /create trigger staff_signature_images_audit\s+after insert or update or delete/);
  assert.match(companyMigration, /changed_columns/);
  const fn = companyMigration.slice(companyMigration.indexOf("create or replace function public.audit_contract_settings_change"));
  assert.doesNotMatch(fn, /full_name|'cpf'|v_new->>'email'|powers_description'\)/);
});

test("modelos: produção só com aprovação jurídica — CHECK + RPCs; estado seguro forçado em INSERT; conteúdo imutável", () => {
  assert.match(governanceMigration, /contract_templates_production_requires_legal_approval check \(\s*not active or legal_approved_at is not null/);
  assert.match(governanceMigration, /alter column active set default false/);
  assert.match(governanceMigration, /create trigger contract_templates_force_safe_insert\s+before insert/);
  assert.match(governanceMigration, /create trigger contract_templates_guard_update\s+before update/);
  assert.match(governanceMigration, /Uma versão de modelo de contrato é imutável/);
  const activate = governanceMigration.slice(governanceMigration.indexOf("create or replace function public.set_contract_template_active"));
  assert.match(activate, /security definer/);
  assert.match(activate, /if not public\.is_active_admin_or_owner\(\) then\s+raise exception 'Somente administrador ou proprietário ativa/);
  assert.match(activate, /legal_approved_at is null then\s+raise exception 'Ativação para produção exige aprovação jurídica/);
});

test("modelos: aprovar/revogar só admin/owner, com nota e evidência mínimas e hash do conteúdo; tudo auditado", () => {
  const approve = governanceMigration.slice(
    governanceMigration.indexOf("create or replace function public.record_contract_template_legal_approval"),
    governanceMigration.indexOf("create or replace function public.revoke_contract_template_legal_approval"),
  );
  assert.match(approve, /if not public\.is_active_admin_or_owner\(\) then/);
  assert.match(approve, /char_length\(btrim\(coalesce\(p_note, ''\)\)\) < 10/);
  assert.match(approve, /sha256\(convert_to\(v_row\.content/);
  assert.match(approve, /'legal_approval_recorded'/);
  for (const action of ["'test_enabled'", "'legal_approval_revoked'", "'production_activated'", "'production_deactivated'", "'new_version'"]) {
    assert.ok(governanceMigration.includes(action), `auditoria ausente: ${action}`);
  }
});

test("todas as RPCs novas: revoke de public/anon e grant só a authenticated; as 6 minutas seed não são ativadas", () => {
  for (const fn of [
    "set_contract_template_test_mode(uuid, boolean)",
    "record_contract_template_legal_approval(uuid, text, text)",
    "revoke_contract_template_legal_approval(uuid, text)",
    "set_contract_template_active(uuid, boolean)",
  ]) {
    assert.ok(governanceMigration.includes(`revoke all on function public.${fn} from public, anon;`), `revoke ausente: ${fn}`);
    assert.ok(governanceMigration.includes(`grant execute on function public.${fn} to authenticated;`), `grant ausente: ${fn}`);
  }
  assert.doesNotMatch(governanceMigration, /update public\.contract_templates\s+set active = true/);
  assert.doesNotMatch(governanceMigration, /insert into public\.contract_templates/);
});

// ------------------------------------------------------------- Server Actions

function exportedFunctions(source: string): Array<{ name: string; body: string }> {
  const parts = source.split(/export async function /).slice(1);
  return parts.map((part) => ({ name: part.slice(0, part.indexOf("(")), body: part }));
}

test("Meu perfil: TODA ação de assinatura confere a concessão EXPLÍCITA no servidor antes de qualquer leitura/escrita", () => {
  const source = read("apps/sistema/src/app/sistema/perfil/signature-actions.ts");
  const actions = exportedFunctions(source);
  assert.deepEqual(actions.map((a) => a.name).sort(), ["getMySignatureStateAction", "removeMySignatureAction", "uploadMySignatureAction"]);
  for (const action of actions) {
    const permissionAt = action.body.indexOf("checkContractSigningGrant()");
    assert.ok(permissionAt > 0, `${action.name} não confere a permissão`);
    for (const forbidden of ["createSupabaseServerClient()", "createSupabaseAdminClient", "storeSignatureImage(", ".from("]) {
      const at = action.body.indexOf(forbidden);
      assert.ok(at === -1 || at > permissionAt, `${action.name}: ${forbidden} antes da checagem de permissão`);
    }
  }
  // Só mexe na PRÓPRIA imagem: o id vem da sessão, nunca do navegador.
  assert.doesNotMatch(source, /formData\.get\("(profileId|profile_id|userId)"\)/);
  assert.match(source, /auth\.getUser\(\)/);
});

test("Meu perfil: sem permissão o servidor devolve authorized:false e o componente não renderiza nada", () => {
  const actions = read("apps/sistema/src/app/sistema/perfil/signature-actions.ts");
  assert.match(actions, /if \(denied\) return \{ ok: true, state: \{ authorized: false, hasImage: false \} \}/);
  const section = read("apps/sistema/src/features/perfil/SignatureSection.tsx");
  assert.match(section, /if \(!state \|\| !state\.authorized\) return null/);
  assert.match(read("apps/sistema/src/app/sistema/perfil/page.tsx"), /<SignatureSection \/>/);
});

test("Empresa/representante: TODA ação exige admin/owner antes de acessar dados; PNG só pelo storage privado do servidor", () => {
  const source = read("apps/sistema/src/app/sistema/configuracoes/empresa/actions.ts");
  const actions = exportedFunctions(source);
  assert.ok(actions.length >= 6);
  for (const action of actions) {
    const guardAt = action.body.indexOf("requireAdminOrOwner(client)");
    assert.ok(guardAt > 0, `${action.name} não exige admin/owner`);
    assert.ok(!action.body.slice(0, guardAt).includes('.from("company'), `${action.name} acessa dados antes do guard`);
  }
  assert.match(source, /uploadSignatureObject/);
  assert.doesNotMatch(source, /getPublicUrl/);
  const page = read("apps/sistema/src/app/sistema/configuracoes/empresa/page.tsx");
  assert.match(page, /if \(!guard\.ok\) notFound\(\)/);
});

test("armazenamento de imagens/PDFs: sem URL pública, upsert:false, URL assinada de curta duração, service role só no servidor", () => {
  for (const file of ["signatureImageStorage.ts", "templateDocumentStorage.ts"]) {
    const source = read(`apps/sistema/src/lib/contracts/${file}`);
    assert.match(source, /import "server-only"/);
    assert.doesNotMatch(source, /getPublicUrl/);
    assert.match(source, /upsert: false/);
    assert.match(source, /createSignedUrl\(path, [A-Z_]+_TTL_SECONDS\)/);
  }
  assert.match(read("apps/sistema/src/lib/contracts/signatureImageStorage.ts"), /SIGNATURE_URL_TTL_SECONDS = 60/);
});

test("modelos: ativar produção exige admin/owner; aprovar/revogar exigem admin/owner; upload valida os bytes do PDF; caminho do anexo nunca vai ao navegador", () => {
  const source = read("apps/sistema/src/app/sistema/financeiro/modelos-contrato/actions.ts");
  const byName = new Map(exportedFunctions(source).map((a) => [a.name, a.body]));
  assert.match(byName.get("setContractTemplateActiveAction")!, /if \(active\) \{\s+const admin = await requireAdminOrOwner/);
  assert.match(byName.get("recordContractTemplateLegalApprovalAction")!, /requireAdminOrOwner/);
  assert.match(byName.get("revokeContractTemplateLegalApprovalAction")!, /requireAdminOrOwner/);
  assert.match(byName.get("uploadContractTemplateDocumentAction")!, /checkFinanceAction\("contratos_editar"\)[\s\S]*inspectTemplatePdf\(bytes\)/);
  assert.match(byName.get("getContractTemplateDocumentUrlAction")!, /createTemplateDocumentSignedUrl/);
  const repo = read("apps/sistema/src/providers/supabase/contractTemplateRepository.supabase.ts");
  const columns = /const COLUMNS =\s*"([^"]+)"/.exec(repo)?.[1] ?? "";
  assert.doesNotMatch(columns, /attachment_path/);
  assert.match(repo, /attachment_path: record\.attachment\?\.path/);
  assert.doesNotMatch(repo, /active: (true|false),\s*\n\s*test_enabled/);
});

test("modelos: nenhuma ação envia contrato, cobra, assina, notifica ou toca NFS-e/financeiro", () => {
  for (const file of [
    "apps/sistema/src/app/sistema/financeiro/modelos-contrato/actions.ts",
    "apps/sistema/src/app/sistema/perfil/signature-actions.ts",
    "apps/sistema/src/app/sistema/configuracoes/empresa/actions.ts",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /whatsapp|sendEmail|telegram|nfse|payment_charge|receivables|commercial_signature|contract_signature/i, file);
  }
});

// ------------------------------------------------ concessão explícita para TODOS

const explicitMigration = read("supabase/migrations/20261122170000_explicit_contract_signing_grant.sql");
const explicitCode = withoutComments(explicitMigration);

test("assinar contratos comerciais: a função SQL exige linha allowed=true para QUALQUER papel (admin/owner não passam por atalho de papel)", () => {
  const fn = explicitCode.slice(explicitCode.indexOf("create or replace function public.staff_can_sign_commercial_contracts"), explicitCode.indexOf("revoke all on function public.staff_can_sign_commercial_contracts"));
  assert.match(fn, /g\.module_key = 'publicidade'\s+and g\.action_key = 'contratos_assinar'\s+and g\.allowed/);
  assert.match(fn, /p\.active/);
  assert.doesNotMatch(fn, /staff_can_module_action/);
  assert.doesNotMatch(fn, /p\.role in \('owner', 'admin'\)\s*\)\s*;?\s*\$\$/);
  assert.match(explicitCode, /revoke all on function public\.staff_can_sign_commercial_contracts\(\) from public, anon/);
});

test("PNG do funcionário: a RLS passa a depender da concessão explícita (admin/owner sem concessão perdem acesso)", () => {
  assert.match(explicitCode, /drop policy if exists staff_signature_images_select_own/);
  assert.match(explicitCode, /profile_id = \(select auth\.uid\(\)\)\s+and public\.staff_can_sign_commercial_contracts\(\)/);
  assert.doesNotMatch(explicitCode, /staff_can_module_action\('publicidade', 'contratos_assinar'\)/);
});

test("concessão para admin/owner: só o PROPRIETÁRIO, só esta ação; operadores seguem pelas políticas existentes; sem service role", () => {
  for (const kind of ["insert", "update"]) {
    const block = explicitCode.slice(explicitCode.indexOf(`create policy staff_module_actions_${kind === "insert" ? "add" : "edit"}_contract_signing`));
    assert.match(block, /module_key = 'publicidade'\s+and action_key = 'contratos_assinar'\s+and \(select public\.is_active_owner\(\)\)/);
    assert.match(block, /p\.role in \('owner', 'admin'\)/);
  }
  assert.doesNotMatch(explicitCode, /staff_module_action_permissions\s+for delete/);
  const action = read("apps/sistema/src/app/sistema/usuarios/contract-signing-actions.ts");
  assert.doesNotMatch(action, /createSupabaseAdminClient|SERVICE_ROLE/);
  assert.match(action, /actor\.role === "admin" && target\.role !== "operator"/);
  assert.match(action, /action_key: "contratos_assinar"/);
  assert.match(action, /Somente administrador ou proprietário gerencia esta concessão/);
});

test("guarda do servidor: checkContractSigningGrant usa a função explícita, nunca checkModuleAction/papel", () => {
  const guard = read("apps/sistema/src/lib/permissions/checkContractSigningGrant.ts").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(guard, /rpc\("staff_can_sign_commercial_contracts"\)/);
  assert.doesNotMatch(guard, /checkModuleAction|staff_can_module_action/);
  assert.match(guard, /data === true \? null/);
  const actions = read("apps/sistema/src/app/sistema/perfil/signature-actions.ts");
  assert.doesNotMatch(actions, /checkModuleAction/);
});

test("tela de usuários: painel de concessão explícita para todos os papéis, com auditoria já garantida por trigger", () => {
  const panel = read("apps/sistema/src/features/usuarios/ContractSigningGrantsPanel.tsx");
  assert.match(panel, /inclusive para administradores e proprietário/);
  assert.match(panel, /if \(currentRole !== "owner" && currentRole !== "admin"\) return null/);
  assert.match(panel, /if \(currentRole === "owner"\) return true;\s+return user\.role === "operator"/);
  const manager = read("apps/sistema/src/features/usuarios/UsersManager.tsx");
  assert.match(manager, /<ContractSigningGrantsPanel/);
  const trigger = read("supabase/migrations/20261122140000_contract_signing_permission_and_permission_audit.sql");
  assert.match(trigger, /after insert or update on public\.staff_module_action_permissions/);
});

test("a regra geral de acesso administrativo dos outros módulos NÃO muda (staff_can_module_action intacta nas migrations novas)", () => {
  for (const name of [
    "20261122140000_contract_signing_permission_and_permission_audit.sql",
    "20261122150000_company_profile_representatives_signature_images.sql",
    "20261122160000_contract_template_governance.sql",
    "20261122170000_explicit_contract_signing_grant.sql",
  ]) {
    assert.doesNotMatch(withoutComments(read(`supabase/migrations/${name}`)), /create or replace function public\.staff_can_module_action/, name);
  }
});
