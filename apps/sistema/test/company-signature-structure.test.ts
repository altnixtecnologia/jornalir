import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateLayoutForSaving } from "../src/lib/signatures/signaturePlacement";

// Etapa 3A: estrutura e segurança da assinatura da empresa (leitura do código-fonte;
// nenhuma Server Action é importada nem executada, nada toca produção).

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8");
const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ACTIONS = strip(read("../src/app/sistema/contratos-assinatura/actions.ts"));
const SERVER = strip(read("../src/lib/signatures/companySigningServer.ts"));
const PANEL = read("../src/features/contratos/CompanySignaturePanel.tsx");
const MIGRATION = read("../../../supabase/migrations/20261122210000_company_signature_3a.sql");
const INSTITUTIONAL = strip(read("../src/app/sistema/financeiro/contratos/signature-actions.ts"));
const COMMERCIAL = strip(read("../src/app/sistema/publicidade/vendas/[id]/commercial-signature-invitation-actions.ts"));

function body(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} não encontrada`);
  const next = source.indexOf("export async function", start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

test("as ações de assinatura delegam à lib testada com os adaptadores reais (sem regra duplicada)", () => {
  assert.match(body(ACTIONS, "openCompanySignatureRoundAction"), /openCompanyRound\(input, createCompanySigningDeps\(\)\)/);
  assert.match(body(ACTIONS, "changeCompanySignatureRepresentativeAction"), /changeRoundRepresentative\(roundId, representativeId, createCompanySigningDeps\(\)\)/);
  assert.match(body(ACTIONS, "cancelCompanySignatureRoundAction"), /cancelCompanyRound\(roundId, reason, createCompanySigningDeps\(\)\)/);
  assert.match(body(ACTIONS, "confirmCompanySignatureAction"), /confirmCompanySignature\(input, createCompanySigningDeps\(\)\)/);
});

test("permissões no SERVIDOR: preparar = revisor comercial / contratos_editar; assinar comercial = concessão explícita; institucional = representante vinculado", () => {
  assert.match(SERVER, /checkModuleAction\("publicidade", "contratos_revisar"\)/);
  assert.match(SERVER, /checkFinanceAction\("contratos_editar"\)/);
  assert.match(SERVER, /checkSigningGrant: \(\) => checkContractSigningGrant\(\)/);
  const library = strip(read("../src/lib/signatures/companySigning.ts"));
  assert.match(library, /deps\.checkSigningGrant\(\)/);
  assert.match(library, /rep\.profile_id === actor\.profileId/);
  assert.match(library, /deps\.reauthenticate\(input\.password\)/);
});

test("reautenticação: senha da PRÓPRIA sessão, cliente temporário sem persistir cookie, usuário precisa ser o mesmo", () => {
  const reauth = SERVER.slice(SERVER.indexOf("reauthenticate: async"), SERVER.indexOf("actor: async"));
  assert.match(reauth, /signInWithPassword\(\{ email: actor\.email, password \}\)/);
  assert.match(reauth, /persistSession: false/);
  assert.match(reauth, /data\.user\?\.id !== actor\.profileId/);
  assert.match(reauth, /signOut\(\{ scope: "local" \}\)/);
});

test("o PNG só é carregado do dono (perfil de quem assina / representante que assina) e só vale se o hash conferir", () => {
  const png = SERVER.slice(SERVER.indexOf("loadSignaturePng"), SERVER.indexOf("reauthenticate"));
  assert.match(png, /staff_signature_images/);
  assert.match(png, /company_legal_representatives/);
  assert.match(png, /sha256Hex\(bytes\) === sha/);
  assert.doesNotMatch(strip(read("../src/lib/signatures/companySigning.ts")), /signaturePng:\s*await/);
});

test("convite ao cliente: portões de servidor nos DOIS fluxos (institucional: convite e rodada; comercial: rodada), contratada sem link", () => {
  assert.equal((INSTITUTIONAL.match(/institutionalCompanyGate\(input\.contractId, input\.documentId\)/g) ?? []).length, 2);
  assert.match(COMMERCIAL, /commercialCompanyGate\(doc\.id\)/);
  assert.match(COMMERCIAL, /signer_role!=="contratada"/);
  assert.ok(COMMERCIAL.indexOf("commercialCompanyGate") < COMMERCIAL.indexOf("create_commercial_signature_request"));
});

test("migration: escrita só pelo servidor, imutabilidade, trava após iniciar, barreiras de convite e unicidade", () => {
  assert.match(MIGRATION, /revoke all on public\.contract_company_signature_rounds from public, anon, authenticated/);
  assert.match(MIGRATION, /grant select on public\.contract_company_signature_rounds to authenticated/);
  assert.doesNotMatch(MIGRATION, /grant (insert|update|delete)[^;]*contract_company_signature(s|_rounds)[^;]* to authenticated/);
  for (const name of ["claim_company_signature_turn", "release_company_signature_turn", "finalize_company_signature", "cancel_company_signature_round"]) {
    assert.match(MIGRATION, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`));
    assert.match(MIGRATION, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role`));
  }
  assert.match(MIGRATION, /before update or delete on public\.contract_company_signatures/);
  assert.match(MIGRATION, /Assinatura iniciada: representante e documento não podem ser trocados/);
  assert.match(MIGRATION, /company_round_one_active_commercial/);
  assert.match(MIGRATION, /company_round_one_active_institutional/);
  assert.match(MIGRATION, /create trigger contract_signature_invitations_company_first/);
  assert.match(MIGRATION, /create trigger commercial_signature_invitations_company_first/);
  assert.match(MIGRATION, /unique \(round_id, signer_profile_id\)/);
  assert.match(MIGRATION, /unique \(round_id, representative_id\)/);
  // Cada função só executa como service_role.
  assert.equal((MIGRATION.match(/auth\.role\(\) is distinct from 'service_role'/g) ?? []).length >= 5, true);
  // Tabelas existentes não são destruídas.
  assert.doesNotMatch(MIGRATION.replace(/--.*$/gm, ""), /\bdrop (table|column)\b/i);
});

test("migration: o convite comercial parte do PDF assinado pela empresa; sem rodada concluída o claim falha", () => {
  const claim = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.claim_commercial_signature_turn"));
  assert.match(claim, /O documento ainda não foi assinado pela empresa/);
  assert.match(claim, /v_company\.final_path/);
  assert.match(claim, /signer_role<>'contratada'/);
});

test("interface: assinar exige ação explícita; nada é assinado ao abrir, renderizar ou preparar", () => {
  assert.doesNotMatch(PANEL, /useEffect/, "nenhum efeito automático dispara ação");
  assert.equal((PANEL.match(/confirmCompanySignatureAction\(/g) ?? []).length, 1, "só um ponto de confirmação");
  assert.match(PANEL, /disabled=\{!accepted \|\| !typedName\.trim\(\) \|\| !password\}/);
  assert.match(PANEL, /displayedSha256: round\.latestSha256/);
  assert.match(PANEL, /type="password"/);
  assert.doesNotMatch(PANEL, /server-only|node:crypto/);
  assert.doesNotMatch(PANEL, /^import (?!type)[^;]*lib\/signatures\/companySigning(Server)?";/m, "o cliente não importa código de servidor (só tipos)");
});

test("o assinador institucional só oferece a 'Versão assinada pela empresa' para o convite ao cliente", () => {
  const panel = read("../src/features/financeiro/ContractSignaturesPanel.tsx");
  assert.match(panel, /item\.name\.startsWith\("Versão assinada pela empresa"\)/);
});

test("vínculo representante ↔ usuário: só admin/proprietário, usuário ativo, único por representante", () => {
  const settings = strip(read("../src/app/sistema/configuracoes/empresa/actions.ts"));
  const link = body(settings, "setRepresentativeUserLinkAction");
  assert.match(link, /requireAdminOrOwner\(client\)/);
  assert.match(link, /profile\.active !== true/);
  assert.match(link, /duplicate\|unique/);
  assert.match(MIGRATION, /company_legal_representatives_profile_key/);
});

test("layout manual salvo por versão: só admin/proprietário, validado, auditado", () => {
  const save = body(ACTIONS, "saveSignatureFieldLayoutAction");
  assert.match(save, /requireAdminOrOwner\(client\)/);
  assert.match(save, /validateLayoutForSaving\(fields\)/);
  assert.match(save, /signature_field_layout_saved/);
  assert.match(MIGRATION, /create policy field_layouts_write on public\.contract_signature_field_layouts for all to authenticated\s+using \(public\.is_active_admin_or_owner\(\)\)/);
});

test("validação do layout manual na hora de salvar", () => {
  const ok = [
    { kind: "signature" as const, signerKey: "contratada-1", page: 3, x: 0.1, y: 0.7, width: 0.35, height: 0.1 },
    { kind: "signature" as const, signerKey: "contratante-1", page: 3, x: 0.55, y: 0.7, width: 0.35, height: 0.1 },
  ];
  assert.equal(validateLayoutForSaving(ok).ok, true);
  assert.equal(validateLayoutForSaving([ok[0]]).ok, false, "falta o contratante");
  assert.equal(validateLayoutForSaving([{ ...ok[0], signerKey: "qualquer" }, ok[1]]).ok, false);
  assert.equal(validateLayoutForSaving([{ ...ok[0], x: 0.95 }, ok[1]]).ok, false, "invade a margem");
  assert.equal(validateLayoutForSaving([]).ok, false);
});
