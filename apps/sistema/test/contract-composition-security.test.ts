import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { winAnsiSafe } from "../src/lib/contracts/contractTemplatePdf";

// Etapa 2 (08/11/2026): montagem de contratação — permissões, auditoria,
// ausência de persistência/assinatura/envio e integração com o fluxo oficial.
// Convenção do projeto: Server Actions não são importadas; o código-fonte é
// lido e as invariantes de segurança, travadas.

const root = join(__dirname, "..", "..", "..");
const read = (relative: string): string => readFileSync(join(root, relative), "utf8");
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("--")).join("\n");

const ACTIONS = "apps/sistema/src/app/sistema/publicidade/contratacao/actions.ts";

function exported(source: string): Map<string, string> {
  const parts = source.split(/export async function /).slice(1);
  return new Map(parts.map((part) => [part.slice(0, part.indexOf("(")), part]));
}

test("minuta: permissão por modalidade conferida ANTES de qualquer acesso (Comercial=contratos_preparar; Institucional=contratos_criar do Financeiro)", () => {
  const source = withoutComments(read(ACTIONS));
  assert.match(source, /checkFinanceAction\("contratos_criar"\)/);
  assert.match(source, /checkModuleAction\("publicidade", "contratos_preparar"\)/);
  const generate = exported(source).get("generateCompositionPdfAction")!;
  const permissionAt = generate.indexOf("permissionFor(request.modality)");
  assert.ok(permissionAt > 0);
  assert.ok(generate.indexOf("createSupabaseServerClient()") > permissionAt, "o cliente do banco só é criado depois da checagem");
  assert.match(generate, /request\.modality !== "commercial" && request\.modality !== "institutional"/);
});

test("proposta: exige propostas_criar, só itens do catálogo, bloqueia acréscimo; preço de tabela em unit_price e negociado como desconto", () => {
  const create = exported(withoutComments(read(ACTIONS))).get("createProposalFromCompositionAction")!;
  assert.ok(create.indexOf('checkModuleAction("publicidade", "propostas_criar")') > 0);
  assert.ok(create.indexOf('checkModuleAction("publicidade", "propostas_criar")') < create.indexOf("createSupabaseServerClient()"));
  assert.match(create, /service\.kind !== "catalog"/);
  assert.match(create, /adjustmentAmount < 0/);
  assert.match(create, /unitPrice: service\.listUnitPrice/);
  assert.match(create, /discountAmount: totals\.adjustmentAmount/);
  assert.match(create, /getCommercialProposalService\(client\)\.register/);
  assert.match(create, /internalNotes: formatNegotiationNote/);
  // O preço de tabela vem do catálogo do servidor, nunca do navegador.
  assert.match(create, /listUnitPrice: product\.suggestedPrice \?\? service\.listUnitPrice/);
});

test("auditoria: minuta gerada, valores negociados e criação de proposta ficam registrados, com hash do PDF e sem o PDF", () => {
  const source = withoutComments(read(ACTIONS));
  for (const action of ["contract_draft_generated", "negotiated_values_recorded"]) {
    assert.ok(source.includes(`"${action}"`), `auditoria ausente: ${action}`);
  }
  assert.match(source, /pdfSha256: result\.sha256/);
  assert.match(source, /persisted: false/);
  assert.match(source, /entityType, entityId, action, metadata/);
  assert.doesNotMatch(source, /metadata: \{[^}]*pdfBase64/);
});

test("nada é gravado, assinado, enviado, cobrado ou ativado pela montagem de contratação", () => {
  const files = [
    ACTIONS,
    "apps/sistema/src/lib/contracts/compositionDocument.ts",
    "apps/sistema/src/lib/contracts/contractComposition.ts",
    "apps/sistema/src/lib/contracts/contractorProfileLoader.ts",
    "apps/sistema/src/features/contratacao/ContractCompositionBuilder.tsx",
  ];
  for (const file of files) {
    const source = withoutComments(read(file));
    assert.doesNotMatch(source, /\.storage\b|\.upload\(|persistCommercialEvidence/, `${file}: sem gravação em Storage`);
    assert.doesNotMatch(source, /commercial_contract_documents|contract_documents|commercial_signature|contract_signature|receivables|payment_charge|nfse/i, `${file}: sem documentos/assinatura/cobrança/NFS-e`);
    assert.doesNotMatch(source, /whatsapp|sendEmail|telegram|notification_events/i, `${file}: sem envio de mensagens`);
    assert.doesNotMatch(source, /setContractTemplateActiveAction|set_contract_template_active|setTestMode|recordLegalApproval/, `${file}: nunca ativa/aprova modelo`);
  }
  const document = withoutComments(read("apps/sistema/src/lib/contracts/compositionDocument.ts"));
  // Nenhum acesso direto ao banco aqui (só dependências injetadas de leitura); .update() existente é o do hash.
  assert.doesNotMatch(document, /\.from\(|\.rpc\(|\.insert\(|\.delete\(|\.upsert\(/);
  const actions = withoutComments(read(ACTIONS));
  assert.doesNotMatch(actions, /\.insert\(|\.upsert\(|\.delete\(/);
});

test("a tela deixa claro que gera MINUTA (não assina/envia/cobra/ativa) e usa só as ações do servidor", () => {
  const ui = read("apps/sistema/src/features/contratacao/ContractCompositionBuilder.tsx");
  assert.match(ui, /não assina, não envia ao cliente, não gera cobrança e não ativa/);
  assert.match(ui, /MINUTA DE TESTE — SEM EFEITO CONTRATUAL/);
  assert.match(ui, /generateCompositionPdfAction/);
  assert.match(ui, /createProposalFromCompositionAction/);
  assert.match(ui, /ClientPicker/);
  assert.match(ui, /disabled=\{!check\.ok\}/);
});

test("entrada pelo cadastro único: botão na ficha do cliente e atalho no Comercial levam à montagem com ?clientId=", () => {
  assert.match(read("apps/sistema/src/app/sistema/clientes/[id]/page.tsx"), /\/sistema\/publicidade\/contratacao\?clientId=\$\{client\.id\}/);
  assert.match(read("apps/sistema/src/app/sistema/publicidade/page.tsx"), /\/sistema\/publicidade\/contratacao/);
  const page = read("apps/sistema/src/app/sistema/publicidade/contratacao/page.tsx");
  assert.match(page, /getClientService\(supabase\)\.getById\(initialClientId\)/);
  assert.match(page, /if \(!canCommercial && !canInstitutional\)/);
});

// -------------------------------------------------------- função de leitura da CONTRATADA

const loaderMigration = withoutComments(read("supabase/migrations/20261122180000_contractor_profile_for_contract_preparers.sql"));

test("get_contract_contractor_profile: SECURITY DEFINER, só quem prepara/revisa contratos ou admin/owner, sem imagem/hash de assinatura, somente leitura", () => {
  assert.match(loaderMigration, /language plpgsql\s+stable\s+security definer\s+set search_path = ''/);
  assert.match(loaderMigration, /public\.is_active_admin_or_owner\(\)\s+or public\.staff_can_module_action\('publicidade', 'contratos_preparar'\)/);
  assert.match(loaderMigration, /staff_can_module_action\('publicidade', 'contratos_revisar'\)/);
  assert.match(loaderMigration, /staff_can_finance_action\('contratos_criar'\)/);
  assert.match(loaderMigration, /raise exception 'Sem permissao para consultar os dados da contratada\.'/);
  assert.doesNotMatch(loaderMigration, /signature_|storage_path|sha256/);
  assert.doesNotMatch(loaderMigration, /\b(insert|update|delete)\s+(into|from)?\s*public\./i);
  assert.match(loaderMigration, /revoke all on function public\.get_contract_contractor_profile\(\) from public, anon/);
  assert.match(loaderMigration, /grant execute on function public\.get_contract_contractor_profile\(\) to authenticated/);
  assert.match(loaderMigration, /where r\.active/);
});

test("carregador da CONTRATADA tolera migrations não aplicadas (não quebra o fluxo anterior) e nunca inventa dados", () => {
  const loader = withoutComments(read("apps/sistema/src/lib/contracts/contractorProfileLoader.ts"));
  assert.match(loader, /MISSING_CODES = new Set\(\["42883", "42P01", "PGRST202", "PGRST205", "PGRST200"\]\)/);
  assert.match(loader, /buildContractorProfile\(null, \[\], todayIso\)/);
  assert.match(loader, /rpc\("get_contract_contractor_profile"\)/);
});

// --------------------------------------------------------------- documento OFICIAL

test("emissão oficial: CONTRATADA da Etapa 1 só entra quando cadastrada; cláusulas 2.x e cabeçalho das partes são aditivos", () => {
  const issuance = withoutComments(read("apps/sistema/src/lib/contracts/commercialIssuance.ts"));
  assert.match(issuance, /loadContractorProfile\(supabase,/);
  assert.match(issuance, /\.\.\.\(contractor\.configured \? contractor\.variables : \{\}\)/);
  assert.match(issuance, /parties:contractor\.configured/);
  assert.match(issuance, /numberedClauses:clauses\(slot\.index\)/);
  assert.match(issuance, /servicesFromSaleSnapshots\(scoped\)/);
  const draft = withoutComments(read("apps/sistema/src/lib/contracts/commercialLegalDraft.ts"));
  assert.match(draft, /numberedClauses\?: string/);
  assert.match(draft, /"servicos\.clausulas": input\.numberedClauses\.trim\(\)/);
  assert.match(withoutComments(read("apps/sistema/src/app/sistema/publicidade/vendas/[id]/commercial-issuance-actions.ts")), /parties:doc\.parties/);
});

test("emissão oficial continua exigindo modelo ATIVO e versão mais recente: minuta de teste nunca vira documento emitido", () => {
  const issuance = withoutComments(read("apps/sistema/src/lib/contracts/commercialIssuance.ts"));
  assert.match(issuance, /!model\.active/);
  assert.doesNotMatch(issuance, /test_enabled|testEnabled/);
});

// ---------------------------------------------------------------------- PDF seguro

test("PDF: caracteres que a fonte padrão não codifica viram equivalente seguro (nunca derrubam a geração) e acentos são preservados", () => {
  const supported = new Set<number>([...Array(0x7f).keys()].filter((cp) => cp >= 32).concat([0xe7, 0xe3, 0xf5, 0xe9, 0xf3, 0x2014, 0xb7]));
  assert.equal(winAnsiSafe("Configurações → Dados da empresa", supported), "Configurações -> Dados da empresa");
  assert.equal(winAnsiSafe("MINUTA — açã é · ok", supported), "MINUTA — açã é · ok");
  assert.equal(winAnsiSafe("a\tb\u0000c​d", supported), "a    bcd");
  assert.equal(winAnsiSafe("emoji 😀 fim", supported), "emoji ? fim");
  assert.equal(winAnsiSafe("linha1\nlinha2", supported), "linha1\nlinha2");
});

test("PDF: cabeçalho das partes e marca são opcionais (documentos antigos não mudam)", () => {
  const pdf = withoutComments(read("apps/sistema/src/lib/contracts/contractTemplatePdf.ts"));
  assert.match(pdf, /parties\?: ContractPartiesBlock/);
  assert.match(pdf, /watermark\?: string/);
  assert.match(pdf, /if \(input\.parties\)/);
  assert.match(pdf, /if \(input\.watermark\)/);
});
