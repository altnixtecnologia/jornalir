import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALTNIX_CLIENT_EXPORT_RELEASED, parseDigitalClientIds, parseDigitalSelectionPage, digitalSelectionPage, toAltnixDigitalClient, sanitizeDigitalClientSearch } from "../src/lib/integrations/altnixDigitalClientContract";

const data = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "company" as const, status: "active" as const,
  full_name: null, company_name: "Empresa Teste Ltda", trade_name: "Teste",
  cpf: null, cnpj: "11222333000181", phone_primary: "48999990000", email: "a@example.test",
  address_zip: "88900000", address_street: "Rua Teste", address_number: "10",
  address_complement: null, address_city: "São João do Sul", address_state: "SC",
  updated_at: "2026-10-24T12:00:00Z",
};
test("mestre exporta apenas cadastro comum, nunca dados financeiros ou privados", () => {
  const row = {...data, notes: "NÃO EXPORTAR", asaas_customer_id: "secret",
    payment_status: "overdue", contract_id: "financeiro", birth_date: "1995-01-01" };
  assert.deepEqual(toAltnixDigitalClient(row), {
    masterClientId: data.id, name: data.company_name, tradeName: "Teste",
    document: data.cnpj, phone: data.phone_primary, email: data.email,
    postalCode: data.address_zip, street: data.address_street,
    number: data.address_number, complement: null,
    city: data.address_city, region: data.address_state, updatedAt: data.updated_at,
  });
});
test("cadastro inativo ou identidade sem nome não pode sair", () => {
  assert.equal(toAltnixDigitalClient({...data,status:"inactive"}),null);
  assert.equal(toAltnixDigitalClient({...data,company_name:null}),null);
});
test("pessoa física nunca vaza identificadores de empresa", () => {
  const row=toAltnixDigitalClient({...data,kind:"individual",full_name:"Nome Pessoa",cpf:"11122233396"});
  assert.equal(row?.name,"Nome Pessoa");
  assert.equal(row?.document,"11122233396");
  assert.equal(row?.tradeName,null);
});
test("busca rejeita filtro sem conteúdo e neutraliza sintaxe da query", () => {
  assert.equal(sanitizeDigitalClientSearch("*"),null);
  assert.equal(sanitizeDigitalClientSearch("a"),null);
  assert.equal(sanitizeDigitalClientSearch("  Maria, (x)  "),"Maria x");
});

test("piloto de leitura exige produção, env, segredo e autorização individual; sem escrita", () => {
  assert.equal(ALTNIX_CLIENT_EXPORT_RELEASED, true);
  const route=readFileSync(new URL("../src/app/api/integrations/altnix/clients/route.ts",import.meta.url),"utf8");
  assert.match(route,/process\.env\.VERCEL_ENV !== "production"/);
  assert.match(route,/process\.env\.ALTNIX_CLIENT_SYNC_ENABLED !== "true"/);
  assert.match(route,/if \(!secretValid\(request\)\)/);
  assert.match(route,/client_digital_export_permissions!inner\(enabled\)/);
  assert.match(route,/\.eq\("client_digital_export_permissions.enabled", true\)\.eq\("status", "active"\)/);
  // createHash().update() é operação criptográfica, não gravação no banco.
  const databaseSection=route.slice(route.indexOf("const db = createSupabaseAdminClient()"));
  assert.ok(databaseSection.startsWith("const db = createSupabaseAdminClient()"));
  assert.doesNotMatch(databaseSection,/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
});

test("WhatsApp canônico apenas na consulta por ID; jamais telefone como fallback", () => {
  const row = {...data, whatsapp: "48988887777"};
  assert.equal(toAltnixDigitalClient(row)?.whatsapp, undefined);
  assert.equal(toAltnixDigitalClient(row,true)?.whatsapp, row.whatsapp);
  assert.equal(toAltnixDigitalClient({...row,whatsapp:null},true)?.whatsapp,null);
  assert.equal(toAltnixDigitalClient(data,true)?.whatsapp,null);
  assert.equal(toAltnixDigitalClient(row,true)?.phone, data.phone_primary);
});


test("lote de clientes exige UUIDs distintos e limita o volume", () => {
  const other="22222222-2222-4222-8222-222222222222";
  assert.deepEqual(parseDigitalClientIds(data.id+","+other),[data.id,other]);
  assert.equal(parseDigitalClientIds(data.id+","+data.id.toUpperCase()),null);
  assert.equal(parseDigitalClientIds(""),null);
  assert.equal(parseDigitalClientIds(data.id+",*"),null);
  assert.equal(parseDigitalClientIds(Array.from({length:21},(_,i)=>"11111111-1111-4111-8111-"+String(i).padStart(12,"0")).join(",")),null);
  const route=readFileSync(new URL("../src/app/api/integrations/altnix/clients/route.ts",import.meta.url),"utf8");
  assert.ok(route.includes('query.in("id", ids)'));
  assert.ok(route.includes('selection: "altnix_informativo"'));
  assert.ok(route.includes('clients.length !== (data ?? []).length'));
  assert.ok(route.includes('searchParams.has("q")'));
});

test("a seleção do Informativo reutiliza a autorização existente", () => {
  const ui=readFileSync(new URL("../src/features/clientes/DigitalExportControl.tsx",import.meta.url),"utf8");
  assert.ok(ui.includes("Serviços digitais vinculados"));
  assert.ok(ui.includes('type="checkbox"'));
  assert.ok(ui.includes("setClientDigitalExportAction(clientId, next)"));
  assert.ok(!ui.includes("Pré-autorizar"));
});

test("manifesto selecionado: cursor estrito, sem busca mista e sem dados pessoais", () => {
  assert.deepEqual(parseDigitalSelectionPage(new URLSearchParams("selected=1")), { after: null });
  assert.deepEqual(parseDigitalSelectionPage(new URLSearchParams("selected=1&after="+data.id)), { after: data.id });
  for (const raw of ["selected=0","selected=1&selected=1","selected=1&q=Maria","selected=1&id="+data.id,"selected=1&after=","selected=1&after=*&foo=1","after="+data.id]) {
    assert.equal(parseDigitalSelectionPage(new URLSearchParams(raw)), null);
  }
  const ids=Array.from({length:21},(_,i)=>"11111111-1111-4111-8111-"+String(i+1).padStart(12,"0"));
  assert.deepEqual(digitalSelectionPage(ids,null), {ids:ids.slice(0,20),nextAfter:ids[19]});
  assert.deepEqual(digitalSelectionPage([ids[20]!],ids[19]!), {ids:[ids[20]],nextAfter:null});
  assert.deepEqual(digitalSelectionPage([],null), {ids:[],nextAfter:null});
  assert.equal(digitalSelectionPage([ids[0]!,ids[0]!],null),null);
  assert.equal(digitalSelectionPage([ids[1]!,ids[0]!],null),null);
  assert.equal(digitalSelectionPage([ids[0]!],ids[0]!),null);
  const route=readFileSync(new URL("../src/app/api/integrations/altnix/clients/route.ts",import.meta.url),"utf8");
  const start=route.indexOf("if (request.nextUrl.searchParams.has(\"selected\")");
  const end=route.indexOf("const id = request.nextUrl.searchParams.get(\"id\")",start);
  assert.ok(start>route.indexOf("if (!secretValid(request))") && end>start);
  const manifest=route.slice(start,end);
  assert.ok(manifest.includes('.select("id,client_digital_export_permissions!inner(enabled)")'));
  assert.ok(manifest.includes('.eq("client_digital_export_permissions.enabled", true).eq("status", "active")'));
  assert.ok(manifest.includes('.order("id", { ascending: true }).limit(DIGITAL_CLIENT_BATCH_LIMIT + 1)'));
  assert.doesNotMatch(manifest,/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
});


test("novo cadastro seleciona Informativo na mesma gravação, sem ampliar permissões", () => {
  const form=readFileSync(new URL("../src/features/clientes/ClientForm.tsx",import.meta.url),"utf8");
  const page=readFileSync(new URL("../src/app/sistema/clientes/novo/page.tsx",import.meta.url),"utf8");
  const actions=readFileSync(new URL("../src/app/sistema/clientes/actions.ts",import.meta.url),"utf8");
  const repo=readFileSync(new URL("../src/providers/supabase/clientRepository.supabase.ts",import.meta.url),"utf8");
  assert.ok(form.includes('mode === "create" && canSelectInformativo'));
  assert.ok(form.includes("await createClient(payload, selectInformativo)"));
  assert.ok(page.includes('rpc("is_active_admin_or_owner")'));
  assert.ok(actions.includes('typeof selectInformativo !== "boolean"'));
  assert.ok(actions.includes('rpc("is_active_admin_or_owner")'));
  assert.ok(repo.includes('rpc("save_client_with_informativo"'));
  assert.ok(repo.includes('rpc("save_client", { p_id: null'));
});
