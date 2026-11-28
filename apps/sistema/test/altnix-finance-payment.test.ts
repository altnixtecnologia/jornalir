import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PaymentChargeAlreadyPendingError,PaymentChargeService,type PaymentChargeRepository,type PixProvider} from "@ir/core";
import type {PaymentCharge} from "@ir/types";
import {
 executeFinancePayment,parseFinancePaymentRequest,receivablePaymentEligibility,customerSafeCharge,
 type FinancePaymentDeps,type PayableReceivableRow,
} from "../src/lib/integrations/altnixFinancePayment";

const uuid=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const CLIENT=uuid(1),OTHER=uuid(2),REC=uuid(3);
const now=Date.parse("2026-11-27T12:00:00Z");
const base:PayableReceivableRow&{reference:string|null}={clientId:CLIENT,status:"open",balance:300,sourceType:"advertising",commercialSaleId:uuid(9),excludedFromReports:false,reference:"REC-1"};
const cmd=(action:"pix"|"status"|"renew"="pix")=>({canonicalClientId:CLIENT,receivableId:REC,action});
const charge=(over:Partial<PaymentCharge>):PaymentCharge=>({
 id:"old",receivableId:REC,clientId:CLIENT,provider:"asaas",providerChargeId:"pay_old",amount:300,status:"pending",pixCopyPaste:"OLD",publicToken:"tok-old",
 expiresAt:"2026-11-26T02:59:59Z",createdAt:"2026-11-20T00:00:00Z",updatedAt:"2026-11-20T00:00:00Z",...over,
} as PaymentCharge);

/** Serviço REAL sobre repositório em memória (uma pendente por título; cancelar só se pendente) e gateway simulado. */
function backend(initial:PaymentCharge[]=[],gw:{createFails?:boolean;cancel?:"ok"|"fail";remote?:"paid"|"cancelled"|"pending"|"throw"}={}){
 const rows=[...initial];const calls={create:0,cancel:[] as string[]};
 const repo={
  listForReceivable:async()=>[...rows].reverse(),
  findPendingForReceivable:async()=>rows.find(c=>c.status==="pending")??null,
  getById:async(id:string)=>rows.find(c=>c.id===id)??null,
  create:async(record:Partial<PaymentCharge>)=>{
   if(rows.some(c=>c.status==="pending"))throw new PaymentChargeAlreadyPendingError();
   const created={...record,id:"new-"+rows.length,publicToken:"tok-"+rows.length,createdAt:"2026-11-27T12:00:00Z",updatedAt:"2026-11-27T12:00:00Z"} as PaymentCharge;
   rows.push(created);return created;
  },
  update:async(id:string,changes:Partial<PaymentCharge>)=>{
   const row=rows.find(c=>c.id===id);if(!row)throw new Error("not found");
   if(changes.status==="cancelled"&&row.status!=="pending")throw new Error("Cobrança mudou durante a operação.");
   Object.assign(row,changes);return row;
  },
 } as unknown as PaymentChargeRepository;
 const provider:PixProvider={
  async createCharge(){calls.create+=1;if(gw.createFails)throw new Error("gateway_down");
   return {provider:"asaas",providerChargeId:"pay_new",pixCopyPaste:"NEWPIX",expiresAt:"2026-12-03T02:59:59Z",status:"pending"};},
  async getCharge(id){if(gw.remote==="throw")throw new Error("down");return {provider:"asaas",providerChargeId:id,pixCopyPaste:"",status:gw.remote??"cancelled"};},
  async cancelCharge(id){calls.cancel.push(id);if(gw.cancel==="fail")throw new Error("timeout");},
 };
 const service=new PaymentChargeService(repo,provider,true);
 const deps=(receivable:FinancePaymentDeps["receivable"]):FinancePaymentDeps=>({
  receivable,charges:service as unknown as FinancePaymentDeps["charges"],
  isAlreadyPendingError:e=>e instanceof PaymentChargeAlreadyPendingError,now:()=>now,
 });
 return {rows,calls,deps};
}
const state=(r:{body:Record<string,unknown>})=>(r.body.charge as {state:string}).state;

test("requisição estrita: só os três campos, UUID e ação conhecida",()=>{
 for(const action of ["pix","status","renew"] as const)assert.deepEqual(parseFinancePaymentRequest({canonicalClientId:CLIENT,receivableId:REC,action}),cmd(action));
 for(const bad of [null,[],"x",{canonicalClientId:CLIENT,receivableId:REC},{canonicalClientId:CLIENT,receivableId:REC,action:"refund"},
  {canonicalClientId:"x",receivableId:REC,action:"pix"},{canonicalClientId:CLIENT,receivableId:REC,action:"pix",amount:1},
  {canonicalClientId:CLIENT,receivableId:REC,action:"renew",status:"paid"}])assert.equal(parseFinancePaymentRequest(bad),null);
});

test("elegibilidade: titularidade, quitado, cancelado, teste excluído, escopo e mínimo",()=>{
 assert.equal(receivablePaymentEligibility(base,CLIENT),"eligible");
 assert.equal(receivablePaymentEligibility({...base,status:"partially_paid",balance:80},CLIENT),"eligible");
 assert.equal(receivablePaymentEligibility({...base,clientId:OTHER},CLIENT),"not_owner");
 assert.equal(receivablePaymentEligibility({...base,status:"paid"},CLIENT),"settled");
 assert.equal(receivablePaymentEligibility({...base,balance:0},CLIENT),"settled");
 assert.equal(receivablePaymentEligibility({...base,status:"cancelled"},CLIENT),"ineligible");
 assert.equal(receivablePaymentEligibility({...base,excludedFromReports:true},CLIENT),"excluded");
 assert.equal(receivablePaymentEligibility({...base,sourceType:"subscription"},CLIENT),"ineligible");
 assert.equal(receivablePaymentEligibility({...base,commercialSaleId:null},CLIENT),"ineligible");
 assert.equal(receivablePaymentEligibility({...base,balance:4.99},CLIENT),"below_minimum");
});

test("cliente eligível: Pix criado uma vez com o saldo do servidor (venda conjunta = uma obrigação global)",async()=>{
 const b=backend();
 const result=await executeFinancePayment(cmd(),b.deps(base));
 assert.equal(result.status,200);
 const c=result.body.charge as Record<string,unknown>;
 assert.equal(c.state,"pending");assert.equal(c.amount,300);
 assert.equal(c.paymentUrl,"https://controle.altnix.com.br/pagamento/tok-0");
 assert.equal(b.calls.create,1);
 const text=JSON.stringify(result.body);
 for(const secret of ["pay_new","providerChargeId",'"tok-0"',"publicToken"])assert.ok(!text.includes(secret),secret);
});

test("duplo clique, nova tentativa e corrida: nenhuma cobrança duplicada",async()=>{
 const b=backend();
 const first=await executeFinancePayment(cmd(),b.deps(base));
 const second=await executeFinancePayment(cmd(),b.deps(base));
 assert.deepEqual(second.body,first.body);
 assert.equal(b.calls.create,1);
 const racing=backend();
 const [x,y]=await Promise.all([executeFinancePayment(cmd(),racing.deps(base)),executeFinancePayment(cmd(),racing.deps(base))]);
 assert.equal(racing.calls.create,1);
 assert.equal(racing.rows.filter(c=>c.status==="pending").length,1);
 assert.ok([x.status,y.status].every(s=>s===200));
});

test("timeout/ambiguidade do gateway: reserva conservada, sem nova cobrança às cegas",async()=>{
 const b=backend([],{createFails:true});
 const first=await executeFinancePayment(cmd(),b.deps(base));
 assert.equal(first.status,202);assert.equal(state(first),"reconciling");
 const again=await executeFinancePayment(cmd(),b.deps(base));
 assert.equal(state(again),"reconciling");
 assert.equal(b.calls.create,1,"nenhuma segunda criação remota");
 assert.ok(!JSON.stringify(first.body).includes("gateway_down"));
});

test("título quitado, teste excluído, de outro cliente ou inexistente: recusado sem criar cobrança",async()=>{
 for(const action of ["pix","renew"] as const)
  for(const [patch,status,code] of [[{status:"paid"},409,"settled"],[{excludedFromReports:true},409,"ineligible"],
   [{clientId:OTHER},404,"not_found"],[{status:"cancelled"},409,"ineligible"],[{balance:3},409,"below_minimum"]] as const){
   // Com cobrança pendente e saldo abaixo do mínimo a cobrança existente continua visível (por desenho); aqui exercitamos a recusa.
   const b=backend("balance" in patch?[]:[charge({})]);
   const result=await executeFinancePayment(cmd(action),b.deps({...base,...patch}));
   assert.equal(result.status,status);assert.equal(result.body.code,code);
   assert.equal(b.calls.create+b.calls.cancel.length,0,"nada emitido nem cancelado");
  }
 const missing=backend();
 assert.equal((await executeFinancePayment(cmd("renew"),missing.deps(null))).status,404);
});

test("status nunca cria cobrança; pago só com título quitado; expirado é informado",async()=>{
 const b=backend([charge({status:"paid",paidAt:"2026-11-20T10:00:00Z"})]);
 assert.equal(state(await executeFinancePayment(cmd("status"),b.deps({...base,status:"partially_paid",balance:200}))),"none");
 assert.equal(state(await executeFinancePayment(cmd("status"),b.deps({...base,status:"paid",balance:0}))),"paid");
 const expired=backend([charge({status:"expired"})]);
 assert.equal(state(await executeFinancePayment(cmd("status"),expired.deps(base))),"expired");
 assert.equal(b.calls.create+expired.calls.create,0);
});

test("Pix expirado: 'pix' não substitui às cegas; 'renew' cancela a anterior e emite a nova",async()=>{
 const b=backend([charge({})]);
 const shown=await executeFinancePayment(cmd("pix"),b.deps(base));
 assert.equal(state(shown),"expired");assert.equal(b.calls.create,0);assert.equal(b.calls.cancel.length,0);
 const renewed=await executeFinancePayment(cmd("renew"),b.deps(base));
 assert.equal(renewed.status,200);assert.equal(state(renewed),"pending");
 assert.deepEqual(b.calls.cancel,["pay_old"]);assert.equal(b.calls.create,1);
 assert.equal(b.rows.find(c=>c.id==="old")!.providerChargeId,"pay_old","histórico e referência preservados");
 assert.equal(((renewed.body.charge as {pixCopyPaste:string}).pixCopyPaste),"NEWPIX");
 // Repetir "renew" reaproveita a nova cobrança vigente.
 const again=await executeFinancePayment(cmd("renew"),b.deps(base));
 assert.equal(b.calls.create,1);assert.equal(state(again),"pending");
});

test("Pix expirado local ('expired') também exige cancelamento remoto antes da substituta",async()=>{
 const b=backend([charge({status:"expired"})]);
 assert.equal(state(await executeFinancePayment(cmd("pix"),b.deps(base))),"expired");
 const renewed=await executeFinancePayment(cmd("renew"),b.deps(base));
 assert.equal(state(renewed),"pending");assert.deepEqual(b.calls.cancel,["pay_old"]);
});

test("pagamento tardio: provedor já recebeu → sem substituta (aguarda confirmação do webhook)",async()=>{
 const b=backend([charge({})],{cancel:"fail",remote:"paid"});
 const result=await executeFinancePayment(cmd("renew"),b.deps(base));
 assert.equal(result.status,202);assert.equal(state(result),"confirming");
 assert.equal(b.calls.create,0);
});

test("renovação com resultado ambíguo: sem prova de cancelamento, recusa segura e cai no fallback do operador",async()=>{
 for(const remote of ["pending","throw"] as const){
  const b=backend([charge({})],{cancel:"fail",remote});
  const result=await executeFinancePayment(cmd("renew"),b.deps(base));
  assert.equal(result.status,409);assert.equal(result.body.code,"renewal_unsafe");assert.equal(b.calls.create,0);
 }
 const ambiguous=backend([charge({providerChargeId:undefined})]);
 const result=await executeFinancePayment(cmd("renew"),ambiguous.deps(base));
 assert.equal(result.body.code,"renewal_unsafe");assert.equal(ambiguous.calls.cancel.length,0);
});

test("renovação concorrente e falha ao emitir a substituta: uma só cobrança, sem duplicar",async()=>{
 const racing=backend([charge({})]);
 const results=await Promise.all([1,2,3].map(()=>executeFinancePayment(cmd("renew"),racing.deps(base))));
 assert.equal(racing.rows.filter(c=>c.status==="pending").length,1);
 assert.equal(racing.calls.create,1);
 assert.ok(results.every(r=>state(r)==="pending"));
 const failing=backend([charge({})],{createFails:true});
 const first=await executeFinancePayment(cmd("renew"),failing.deps(base));
 assert.equal(first.status,202);assert.equal(state(first),"reconciling");
 await executeFinancePayment(cmd("renew"),failing.deps(base));
 assert.equal(failing.calls.create,1,"nova tentativa não emite outra");
});

test("cobrança expirada não é reutilizada e valores internos não vazam",()=>{
 const expired=customerSafeCharge({status:"pending",amount:300,provider:"asaas",providerChargeId:"p",pixCopyPaste:"x",publicToken:"t",expiresAt:"2026-11-26T00:00:00Z"},now);
 assert.deepEqual(expired,{state:"expired",amount:300,method:"pix"});
 assert.equal(customerSafeCharge({status:"expired",amount:1},now).state,"expired");
 assert.equal(customerSafeCharge({status:"cancelled",amount:1},now).state,"cancelled");
 assert.equal(customerSafeCharge({status:"weird",amount:1},now).state,"failed");
 assert.equal(customerSafeCharge(null,now).state,"none");
});

test("rota: travas, segredo, allowlist e titularidade antes de qualquer cobrança; reusa serviço existente",()=>{
 const route=readFileSync(new URL("../src/app/api/integrations/altnix/finance-payment/route.ts",import.meta.url),"utf8");
 assert.ok(route.indexOf("JORNALIR_FINANCE_PAYMENT_ENABLED")<route.indexOf("financeBridgeAuthorized("));
 assert.ok(route.indexOf("financeBridgeAuthorized(")<route.indexOf("allowedFinanceClient("));
 const runtime=readFileSync(new URL("../src/lib/integrations/financePaymentRuntime.ts",import.meta.url),"utf8");
 assert.ok(route.indexOf("allowedFinanceClient(")<route.indexOf("runFinancePayment("));
 assert.match(runtime,/receivables_with_balance/);
 assert.match(runtime,/\.eq\("client_id", command\.canonicalClientId\)/);
 assert.match(runtime,/getPaymentChargeService\(db\)/);
 assert.match(runtime,/listReportExcludedReceivableIds/);
 assert.doesNotMatch(route,/body\.(amount|status|balance)|command\.amount/);
 assert.doesNotMatch(route,/confirmPixCharge|confirm_payment_charge|receivable_receipts|insert\(/,"confirmação e recibo seguem o webhook");
 assert.doesNotMatch(route,/ad_contracts|internal_permanent|subscriptions|altnix_apply_service_finance|altnix_queue_service_authorization/,"não toca contrato permanente nem autorização operacional");
});
