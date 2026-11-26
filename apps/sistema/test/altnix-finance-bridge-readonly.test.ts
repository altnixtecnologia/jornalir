import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FINANCE_BRIDGE_VERSION, FINANCE_PAGE_SIZE, allowedFinanceClient,
  canonicalIdOrNull, financeBridgeAuthorized, parseFinanceOffset, projectFinanceSaleServices,
} from "../src/lib/integrations/altnixFinanceReadContract";
const route=readFileSync(new URL("../src/app/api/integrations/altnix/finance-preview/route.ts",import.meta.url),"utf8");

const cid="9280c306-b169-4a7c-bb75-462a9ae0df71";
test("permissão de leitura exige segredo longo e cabeçalho Bearer válido",()=>{
  const secret="segredo-de-conciliacao-com-mais-de-32-caracteres";
  assert.equal(financeBridgeAuthorized("Bearer "+secret,secret),true);
  assert.equal(financeBridgeAuthorized("Bearer "+secret,"outro-segredo-com-mais-de-32-caracteres"),false);
  assert.equal(financeBridgeAuthorized("Basic "+secret,secret),false);
  assert.equal(financeBridgeAuthorized("Bearer x","x"),false);
  assert.equal(financeBridgeAuthorized(null,secret),false);
});
test("IDs autorizados são explícitos, e paginação não admite arbitrários",()=>{
  assert.equal(canonicalIdOrNull(cid.toUpperCase()),cid);
  assert.equal(canonicalIdOrNull("x"),null);
  assert.equal(allowedFinanceClient(cid, "11111111-1111-4111-8111-111111111111,"+cid),true);
  assert.equal(allowedFinanceClient(cid, ""),false);
  assert.equal(allowedFinanceClient(cid,undefined),false);
  assert.equal(allowedFinanceClient(cid, cid+"X"),false);
  assert.equal(parseFinanceOffset(0),0);
  assert.equal(parseFinanceOffset(50),50);
  assert.equal(parseFinanceOffset(-1),null);
  assert.equal(parseFinanceOffset("1"),null);
  assert.equal(parseFinanceOffset(10001),null);
  assert.equal(FINANCE_PAGE_SIZE,50);
  assert.equal(FINANCE_BRIDGE_VERSION,"1");
});
test("rota só lê tabela de recebíveis e recibos e NÃO reabre exportação ou cobrança",()=>{
  assert.match(route,/export async function POST/);
  assert.match(route,/JORNALIR_FINANCE_BRIDGE_READ_ENABLED/);
  assert.match(route,/VERCEL_ENV !== "production"/);
  assert.match(route,/financeBridgeAuthorized\(/);
  assert.match(route,/allowedFinanceClient\(/);
  assert.match(route,/createSupabaseAdminClient\(/);
  assert.match(route,/\.eq\("client_id", id\)/);
  assert.match(route,/\.range\(offset, offset \+ FINANCE_PAGE_SIZE - 1\)/);
  assert.match(route,/\.from\("receivable_receipts"\)/);
  assert.doesNotMatch(route,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.doesNotMatch(route,/cpf|cnpj|whatsapp|phone_primary|asaas_|pix_copy_paste/);
  assert.match(route,/financeCutoverActive: false/);
});

test("identidade financeira preserva venda, competência e IDs de recibo sem truncamento silencioso",()=>{
  assert.match(route,/commercial_sale_id,installment_number,competency_date/);
  assert.match(route,/\.select\("id,receivable_id,amount,received_at,reversed_at", \{ count: "exact" \}\)/);
  assert.match(route,/receiptsComplete = paidCount !== null/);
  assert.match(route,/\.order\("id"\)\.limit\(500\)/);
});


test("vendas comerciais existentes são consultadas por cliente, inclusive sem recebível; completude explícita",()=>{
  assert.match(route,/\.from\("commercial_sales"\)/);
  assert.match(route,/\.select\("id,internal_reference,channel,product_id,commercial_condition,status,start_date,end_date,installments_count,items_snapshot", \{ count: "exact" \}\)\s*\.eq\("client_id", id\)/);
  assert.match(route,/saleCount === null/);
  assert.match(route,/salesComplete: saleCount === sales.length/);
  assert.match(route,/if \(error \|\| count === null\)/);
  assert.doesNotMatch(route,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
});

test("serviços de venda conjunta preservam identidade por item, sem inferência de cabeçalho",()=>{
 const print={sourceProposalItemId:"direct-sale:1",serviceChannel:"newspaper",description:"não exportar"};
 const led={sourceProposalItemId:"direct-sale:2",serviceChannel:"led_panel"};
 assert.deepEqual(projectFinanceSaleServices([print,led]),[{itemKey:"direct-sale:1",serviceChannel:"newspaper"},{itemKey:"direct-sale:2",serviceChannel:"led_panel"}]);
 assert.equal(projectFinanceSaleServices(null),null);
 assert.equal(projectFinanceSaleServices([]),null);
 assert.equal(projectFinanceSaleServices([print,print]),null);
 assert.equal(projectFinanceSaleServices([{...led,serviceChannel:"tv inventada"}]),null);
 assert.equal(projectFinanceSaleServices([{...led,sourceProposalItemId:""}]),null);
 assert.deepEqual(projectFinanceSaleServices([{...led,serviceChannel:"package"}]),[{itemKey:"direct-sale:2",serviceChannel:"package"}]);
 assert.match(route,/services: projectFinanceSaleServices\(row\.items_snapshot\)/);
});

 test("revogar seleção digital também fecha a conciliação",()=>{assert.match(route,/client_digital_export_permissions!inner\(enabled\)/);assert.match(route,/\.eq\("client_digital_export_permissions.enabled", true\)/);});
