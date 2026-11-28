import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PaymentChargeAlreadyPendingError,PaymentChargeService,type PaymentChargeRepository,type PixProvider} from "@ir/core";
import type {PaymentCharge} from "@ir/types";
import {
 cardInstallmentPlan,customerSafeCharge,executeFinancePayment,parseFinancePaymentRequest,
 type FinancePaymentDeps,type FinancePaymentMethods,type PayableReceivableRow,
} from "../src/lib/integrations/altnixFinancePayment";
import {allowedReturnOrigins,buildPortalReturnUrl,buildPublicReturnUrl,trustedAsaasInvoiceUrl} from "../src/lib/financeiro/cardPaymentUrls";
import {cardWebhookPlan} from "../src/lib/financeiro/cardWebhookPolicy";
import {buildAsaasChargebackAttention,isAsaasChargebackEvent} from "../src/lib/financeiro/asaasChargebackAttention";
import {evaluateBatchCandidate} from "../src/lib/notifications/financialBatchEligibility";

const root=new URL("../../..",import.meta.url);
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const readRoot=(p:string)=>readFileSync(new URL(p,root),"utf8");
const uuid=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const CLIENT=uuid(1),OTHER=uuid(2),REC=uuid(3);
const now=Date.parse("2026-12-07T12:00:00Z");
const base:PayableReceivableRow&{reference:string|null}={clientId:CLIENT,status:"open",balance:600,sourceType:"advertising",commercialSaleId:uuid(9),excludedFromReports:false,reference:"REC-1"};
const methods:FinancePaymentMethods={pix:{enabled:true},card:{enabled:true,maxInstallments:6,minInstallmentAmount:50}};
const cmd=(action:"pix"|"card"|"status"|"renew",extra:Record<string,unknown>={})=>({canonicalClientId:CLIENT,receivableId:REC,action,...extra} as ReturnType<typeof parseFinancePaymentRequest> & object);
const INVOICE="https://www.asaas.com/i/abc12345";

const charge=(over:Partial<PaymentCharge>):PaymentCharge=>({
 id:"old",receivableId:REC,clientId:CLIENT,provider:"asaas",providerChargeId:"pay_old",amount:600,status:"pending",pixCopyPaste:"OLDPIX",publicToken:"tok-old",
 paymentMethod:"pix",expiresAt:"2026-12-20T02:59:59Z",createdAt:"2026-12-05T00:00:00Z",updatedAt:"2026-12-05T00:00:00Z",...over} as PaymentCharge);
const cardCharge=(over:Partial<PaymentCharge>={})=>charge({id:"cardold",paymentMethod:"credit_card",providerChargeId:"pay_card_old",pixCopyPaste:undefined,invoiceUrl:INVOICE,installmentCount:1,...over});

/** Serviço REAL (PaymentChargeService) sobre repositório em memória e gateway simulado. */
function backend(initial:PaymentCharge[]=[],gw:{cardFails?:boolean;cancel?:"ok"|"fail";remote?:"paid"|"cancelled"|"pending"|"throw";remoteConfirmed?:boolean;badInvoice?:boolean}={}){
 const rows=[...initial];
 const calls={pix:0,card:0,cancel:[] as string[],lastCard:null as null|Record<string,unknown>};
 const repo={
  listForReceivable:async()=>[...rows].reverse(),
  findPendingForReceivable:async()=>rows.find(c=>c.status==="pending")??null,
  getById:async(id:string)=>rows.find(c=>c.id===id)??null,
  create:async(record:Partial<PaymentCharge>)=>{
   if(rows.some(c=>c.status==="pending"))throw new PaymentChargeAlreadyPendingError();
   const created={...record,id:"new-"+rows.length,publicToken:"tok-"+rows.length,createdAt:"2026-12-07T12:00:00Z",updatedAt:"2026-12-07T12:00:00Z"} as PaymentCharge;
   rows.push(created);return created;
  },
  update:async(id:string,changes:Partial<PaymentCharge>)=>{
   const row=rows.find(c=>c.id===id);if(!row)throw new Error("not found");
   if(changes.status==="cancelled"&&row.status!=="pending")throw new Error("Cobrança mudou durante a operação.");
   Object.assign(row,changes);return row;
  },
 } as unknown as PaymentChargeRepository;
 const provider:PixProvider={
  async createCharge(){calls.pix+=1;return {provider:"asaas",providerChargeId:"pay_pix_"+calls.pix,pixCopyPaste:"NEWPIX",expiresAt:"2026-12-10T02:59:59Z",status:"pending"};},
  async createCardCharge(request){
   calls.card+=1;calls.lastCard={...request};
   if(gw.cardFails)throw new Error("timeout");
   return {provider:"asaas",providerChargeId:"pay_card_"+calls.card,invoiceUrl:gw.badInvoice?"https://evil.example/i/x":INVOICE,
    providerInstallmentId:request.installments>1?"inst_1":undefined,expiresAt:"2026-12-10T02:59:59Z",status:"pending"};
  },
  async getCharge(id){if(gw.remote==="throw")throw new Error("down");return {provider:"asaas",providerChargeId:id,pixCopyPaste:"",status:gw.remote??"cancelled",confirmed:gw.remoteConfirmed};},
  async cancelCharge(id){calls.cancel.push(id);if(gw.cancel==="fail")throw new Error("timeout");},
 };
 const service=new PaymentChargeService(repo,provider,true);
 const deps=(receivable:FinancePaymentDeps["receivable"],over:Partial<FinancePaymentDeps>={}):FinancePaymentDeps=>({
  receivable,charges:service as unknown as FinancePaymentDeps["charges"],methods,cardSuccessUrl:null,
  isAlreadyPendingError:e=>e instanceof PaymentChargeAlreadyPendingError,now:()=>now,...over});
 return {rows,calls,deps};
}
const state=(r:{body:Record<string,unknown>})=>(r.body.charge as {state:string}).state;
const chargeOf=(r:{body:Record<string,unknown>})=>r.body.charge as Record<string,unknown>;

// ------------------------------------------------------------------ URLs e retorno
test("URL da fatura: só https em domínio do Asaas, caminho /i/<código>, sem credenciais nem porta",()=>{
 assert.equal(trustedAsaasInvoiceUrl("https://www.asaas.com/i/080225913252"),"https://www.asaas.com/i/080225913252");
 assert.equal(trustedAsaasInvoiceUrl("https://sandbox.asaas.com/i/abc12345"),"https://sandbox.asaas.com/i/abc12345");
 for(const bad of [null,undefined,42,"","http://www.asaas.com/i/abc12345","https://evil.example/i/abc12345","https://www.asaas.com.evil.example/i/abc12345",
  "https://asaas.com.evil.io/i/abc12345","https://user:pw@www.asaas.com/i/abc12345","https://www.asaas.com:8443/i/abc12345","https://www.asaas.com/outro/abc12345",
  "https://www.asaas.com/i/","javascript:alert(1)","//www.asaas.com/i/abc12345","https://www.asaas.com/i/abc12345/../x","https://www.asaas.com/i/"+"a".repeat(80)])
  assert.equal(trustedAsaasInvoiceUrl(bad),null,String(bad));
});

test("retorno: URL montada de partes validadas; destino externo, protocolo e caminhos forjados são recusados (sem open redirect)",()=>{
 const origins=allowedReturnOrigins(undefined);
 assert.deepEqual(origins,["https://cliente.altnix.com.br"]);
 const ref="a".repeat(32);
 assert.equal(buildPortalReturnUrl({origins,portalCode:"cl_"+"b".repeat(32),ref}),`https://cliente.altnix.com.br/cl_${"b".repeat(32)}?finance=return&ref=${ref}`);
 for(const portalCode of ["../x","a/b","https://evil.example","cl_x","","cl_abc?x=1","a b c d e f g h"])assert.equal(buildPortalReturnUrl({origins,portalCode,ref}),null,portalCode);
 for(const badRef of ["x","A".repeat(32),ref+"0","//evil",undefined])assert.equal(buildPortalReturnUrl({origins,portalCode:"cl_"+"b".repeat(32),ref:badRef}),null);
 assert.equal(buildPortalReturnUrl({origins,origin:"https://evil.example",portalCode:"cl_"+"b".repeat(32),ref}),null,"origem fora da lista");
 assert.deepEqual(allowedReturnOrigins("https://a.example, http://b.example, https://c.example:8080, https://user@d.example, https://e.example/path, nao-url"),["https://a.example"]);
 assert.equal(buildPublicReturnUrl("https://controle.altnix.com.br","t".repeat(24)),`https://controle.altnix.com.br/pagamento/${"t".repeat(24)}?retorno=1`);
 assert.equal(buildPublicReturnUrl("https://controle.altnix.com.br","../x"),null);
});

// ------------------------------------------------------------------ contrato
test("pedido de cartão: parcelas e retorno estritos; nada de valor, status ou destino do navegador",()=>{
 const ref="c".repeat(32),code="cl_"+"d".repeat(32);
 const ok=parseFinancePaymentRequest({canonicalClientId:CLIENT,receivableId:REC,action:"card",installments:3,returnPortalCode:code,returnRef:ref});
 assert.deepEqual(ok,{canonicalClientId:CLIENT,receivableId:REC,action:"card",installments:3,returnPortalCode:code,returnRef:ref});
 const bad:Array<Record<string,unknown>>=[
  {installments:3},{action:"card",installments:0},{action:"card",installments:13},{action:"card",installments:1.5},{action:"card",installments:"3"},
  {action:"card",returnPortalCode:code},{action:"card",returnRef:ref},{action:"card",returnPortalCode:"../x",returnRef:ref},{action:"card",returnPortalCode:code,returnRef:"zz"},
  {action:"pix",returnPortalCode:code,returnRef:ref},{action:"card",returnUrl:"https://evil.example"},{action:"card",amount:1},{action:"card",successUrl:"x"},
 ];
 for(const extra of bad)assert.equal(parseFinancePaymentRequest({canonicalClientId:CLIENT,receivableId:REC,action:"pix",...extra}),null,JSON.stringify(extra));
});

test("parcelamento: sem juros inventados; limite configurado, mínimo por parcela e desligado",()=>{
 const card=methods.card;
 assert.deepEqual(cardInstallmentPlan(600,undefined,card),{ok:true,installments:1,installmentAmount:600,total:600});
 assert.deepEqual(cardInstallmentPlan(600,3,card),{ok:true,installments:3,installmentAmount:200,total:600});
 assert.deepEqual(cardInstallmentPlan(100,3,card),{ok:false,reason:"below_minimum"},"33,33 < mínimo 50");
 assert.deepEqual(cardInstallmentPlan(600,7,card),{ok:false,reason:"invalid"},"acima do máximo configurado");
 assert.deepEqual(cardInstallmentPlan(600,0,card),{ok:false,reason:"invalid"});
 assert.deepEqual(cardInstallmentPlan(600,2,{...card,maxInstallments:1}),{ok:false,reason:"invalid"},"padrão só à vista");
 assert.deepEqual(cardInstallmentPlan(600,1,{...card,enabled:false}),{ok:false,reason:"disabled"});
});

test("resposta ao cliente: URL da fatura validada, rejeição, confirmação e valores; nada de dados de cartão",()=>{
 const pending=customerSafeCharge(cardCharge({installmentCount:3}),now);
 assert.deepEqual([pending.state,pending.method,pending.checkoutUrl,pending.installments,pending.installmentAmount],["pending","credit_card",INVOICE,3,200]);
 assert.equal(customerSafeCharge(cardCharge({invoiceUrl:"https://evil.example/i/x"}),now).checkoutUrl,undefined,"URL fora do Asaas nunca é exibida");
 assert.equal(customerSafeCharge(cardCharge({providerRejectedAt:"2026-12-07T10:00:00Z"}),now).state,"rejected");
 assert.equal(customerSafeCharge(cardCharge({providerConfirmedAt:"2026-12-07T10:00:00Z"}),now).state,"confirming");
 assert.equal(customerSafeCharge(cardCharge({status:"paid",paidAt:"2026-12-07T10:00:00Z"}),now).state,"paid");
 assert.equal(customerSafeCharge(cardCharge({expiresAt:"2026-12-01T00:00:00Z"}),now).state,"expired");
 assert.equal(customerSafeCharge(cardCharge({providerChargeId:undefined}),now).state,"reconciling");
 const text=JSON.stringify([pending,customerSafeCharge(cardCharge({}),now)]);
 assert.ok(!/pay_card_old|providerChargeId|cvv|numero|number|holder|expiry/i.test(text));
});

// ------------------------------------------------------------------ fluxos de pagamento
test("cartão autorizado: uma cobrança, valor do servidor, fatura hospedada, retorno só quando já validado",async()=>{
 const b=backend();
 const ret=`https://cliente.altnix.com.br/cl_${"d".repeat(32)}?finance=return&ref=${"c".repeat(32)}`;
 const result=await executeFinancePayment(cmd("card",{installments:3}),b.deps(base,{cardSuccessUrl:ret}));
 assert.equal(result.status,200);
 const c=chargeOf(result);
 assert.equal(c.state,"pending");assert.equal(c.method,"credit_card");assert.equal(c.checkoutUrl,INVOICE);assert.equal(c.installments,3);assert.equal(c.installmentAmount,200);assert.equal(c.amount,600);
 assert.equal(b.calls.card,1);assert.equal(b.calls.pix,0);
 assert.deepEqual({...b.calls.lastCard,expiresAt:undefined},{receivableId:REC,clientId:CLIENT,amount:600,description:"REC-1",installments:3,expiresAt:undefined,successUrl:ret});
 assert.ok(!/pay_card_1|providerChargeId|publicToken/.test(JSON.stringify(result.body)));
 assert.deepEqual((result.body.methods as FinancePaymentMethods).card.maxInstallments,6);
 // Sem URL de retorno validada nada é enviado ao provedor.
 const bare=backend();await executeFinancePayment(cmd("card"),bare.deps(base));
 assert.equal(bare.calls.lastCard!.successUrl,undefined);
});

test("cliente não autorizado, título quitado, de teste, forma indisponível e parcelamento inválido: recusados sem tocar o provedor",async()=>{
 const cases:Array<[Partial<PayableReceivableRow>,Record<string,unknown>,Partial<FinancePaymentDeps>,number,string]>=[
  [{clientId:OTHER},{},{},404,"not_found"],[{status:"paid"},{},{},409,"settled"],[{excludedFromReports:true},{},{},409,"ineligible"],
  [{},{},{methods:{...methods,card:{...methods.card,enabled:false}}},409,"method_unavailable"],
  [{},{installments:9},{},409,"installments_invalid"],[{balance:90},{installments:3},{},409,"installments_invalid"],
 ];
 for(const [patch,extra,depsOver,status,code] of cases){
  const b=backend();
  const result=await executeFinancePayment(cmd("card",extra),b.deps({...base,...patch},depsOver));
  assert.equal(result.status,status,code);assert.equal(result.body.code,code);
  assert.equal(b.calls.card+b.calls.pix+b.calls.cancel.length,0,"nada criado nem cancelado: "+code);
 }
});

test("PIX → cartão e cartão → PIX: troca só com cancelamento comprovado; histórico e referências preservados",async()=>{
 const toCard=backend([charge({})]);
 const first=await executeFinancePayment(cmd("card",{installments:2}),toCard.deps(base));
 assert.equal(state(first),"pending");assert.equal(chargeOf(first).method,"credit_card");
 assert.deepEqual(toCard.calls.cancel,["pay_old"]);
 const old=toCard.rows.find(c=>c.id==="old")!;
 assert.equal(old.status,"cancelled");assert.equal(old.providerChargeId,"pay_old");assert.equal(old.cancellationReason,"troca_de_forma_de_pagamento_pelo_cliente");
 assert.equal(old.cancelledByProfileId,undefined,"sem operador emprestado");
 assert.equal(toCard.rows.filter(c=>c.status==="pending").length,1,"uma única cobrança pendente por título");

 const toPix=backend([cardCharge()]);
 const second=await executeFinancePayment(cmd("pix"),toPix.deps(base));
 assert.equal(state(second),"pending");assert.equal(chargeOf(second).method,"pix");assert.equal((chargeOf(second).pixCopyPaste),"NEWPIX");
 assert.deepEqual(toPix.calls.cancel,["pay_card_old"]);assert.equal(toPix.rows.filter(c=>c.status==="pending").length,1);
});

test("cobrança já pendente: mesma forma é reaproveitada sem chamar o provedor; parcelas diferentes trocam; clique repetido não duplica",async()=>{
 const b=backend([cardCharge({installmentCount:3})]);
 const same=await executeFinancePayment(cmd("card",{installments:3}),b.deps(base));
 assert.equal(state(same),"pending");assert.deepEqual([b.calls.card,b.calls.pix,b.calls.cancel.length],[0,0,0]);
 const other=await executeFinancePayment(cmd("card",{installments:2}),b.deps(base));
 assert.equal((chargeOf(other).installments),2);assert.equal(b.calls.card,1);assert.deepEqual(b.calls.cancel,["pay_card_old"]);
 const again=await executeFinancePayment(cmd("card",{installments:2}),b.deps(base));
 assert.equal(b.calls.card,1,"mesma escolha reaproveita");assert.equal(state(again),"pending");
 const pix=backend([charge({})]);
 await executeFinancePayment(cmd("pix"),pix.deps(base));assert.deepEqual([pix.calls.pix,pix.calls.cancel.length],[0,0]);
});

test("tentativas concorrentes de cartão e de troca: uma só cobrança pendente",async()=>{
 const fresh=backend();
 const results=await Promise.all([1,2,3].map(()=>executeFinancePayment(cmd("card",{installments:2}),fresh.deps(base))));
 assert.equal(fresh.rows.filter(c=>c.status==="pending").length,1);assert.equal(fresh.calls.card,1);
 assert.ok(results.every(r=>state(r)==="pending"));
 const switching=backend([charge({})]);
 const mixed=await Promise.all([executeFinancePayment(cmd("card"),switching.deps(base)),executeFinancePayment(cmd("card"),switching.deps(base)),executeFinancePayment(cmd("pix"),switching.deps(base))]);
 assert.equal(switching.rows.filter(c=>c.status==="pending").length,1,"pedidos conflitantes serializados pelo índice único");
 assert.ok(mixed.every(r=>r.status===200||r.status===202||r.status===409));
});

test("timeout do gateway ao criar cartão: reserva preservada, sem nova cobrança às cegas",async()=>{
 const b=backend([],{cardFails:true});
 const first=await executeFinancePayment(cmd("card"),b.deps(base));
 assert.equal(first.status,202);assert.equal(state(first),"reconciling");
 const again=await executeFinancePayment(cmd("card"),b.deps(base));
 assert.equal(state(again),"reconciling");assert.equal(b.calls.card,1,"nenhuma segunda criação remota");
 const trade=await executeFinancePayment(cmd("pix"),b.deps(base));
 assert.equal(trade.body.code,"renewal_unsafe","reserva ambígua nunca é trocada");assert.equal(b.calls.pix,0);
});

test("confirmação tardia: cartão já confirmado ou recebido nunca é cancelado nem substituído",async()=>{
 const confirmed=backend([cardCharge({providerConfirmedAt:"2026-12-07T11:59:00Z"})]);
 const a=await executeFinancePayment(cmd("pix"),confirmed.deps(base));
 assert.equal(a.status,202);assert.equal(state(a),"confirming");assert.deepEqual([confirmed.calls.cancel.length,confirmed.calls.pix],[0,0]);
 // O provedor confirmou no instante da troca: o cancelamento falha e a consulta mostra "confirmado".
 const racing=backend([cardCharge({})],{cancel:"fail",remote:"pending",remoteConfirmed:true});
 const b=await executeFinancePayment(cmd("pix"),racing.deps(base));
 assert.equal(state(b),"confirming");assert.equal(racing.calls.pix,0);assert.equal(racing.rows.find(c=>c.id==="cardold")!.status,"pending");
 const received=backend([cardCharge({})],{cancel:"fail",remote:"paid"});
 assert.equal(state(await executeFinancePayment(cmd("pix"),received.deps(base))),"confirming");
 // Cancelamento sem prova: recusa segura.
 const doubtful=backend([cardCharge({})],{cancel:"fail",remote:"throw"});
 assert.equal((await executeFinancePayment(cmd("pix"),doubtful.deps(base))).body.code,"renewal_unsafe");
});

test("cartão recusado: cobrança segue pendente, cliente vê 'não aprovado' e pode tentar de novo ou trocar para PIX",async()=>{
 const b=backend([cardCharge({providerRejectedAt:"2026-12-07T10:00:00Z"})]);
 const status=await executeFinancePayment(cmd("status"),b.deps(base));
 assert.equal(state(status),"rejected");assert.equal(chargeOf(status).checkoutUrl,INVOICE);
 const retry=await executeFinancePayment(cmd("card"),b.deps(base));
 assert.equal(state(retry),"rejected","mesma fatura reaproveitada, sem nova cobrança");assert.equal(b.calls.card,0);
 const pix=await executeFinancePayment(cmd("pix"),b.deps(base));
 assert.equal(chargeOf(pix).method,"pix");assert.deepEqual(b.calls.cancel,["pay_card_old"]);
});

test("cobrança expirada: cartão só é renovado por escolha explícita; 'pix' simples não substitui",async()=>{
 const b=backend([cardCharge({expiresAt:"2026-12-01T00:00:00Z"})]);
 assert.equal(state(await executeFinancePayment(cmd("status"),b.deps(base))),"expired");
 const renewed=await executeFinancePayment(cmd("card"),b.deps(base));
 assert.equal(state(renewed),"pending");assert.deepEqual(b.calls.cancel,["pay_card_old"]);
});

test("URL da fatura fora do Asaas: o provedor recusa e o cliente nunca recebe link",async()=>{
 const b=backend([],{badInvoice:true});
 const result=await executeFinancePayment(cmd("card"),b.deps(base));
 assert.equal(chargeOf(result).checkoutUrl,undefined);
});

// ------------------------------------------------------------------ webhook, contabilidade e recibo
test("webhook de cartão: confirmação baixa uma vez; liquidação só registra marcos; recusa mantém pendente; estorno e chargeback pedem conciliação",()=>{
 const plan=(eventType:string,over:Partial<Parameters<typeof cardWebhookPlan>[0]>={})=>cardWebhookPlan({eventType,isCard:true,chargeStatus:"pending",strictSettlement:false,...over});
 assert.deepEqual(plan("PAYMENT_CONFIRMED"),{settle:true,settlementOnly:false,markConfirmed:true,markSettled:false,markRejected:false,attention:null});
 const settled=plan("PAYMENT_RECEIVED",{chargeStatus:"paid"});
 assert.deepEqual([settled.settle,settled.settlementOnly,settled.markSettled],[true,true,true],"liquidação após baixa: só marcos (sem novo recibo/aviso)");
 assert.equal(plan("PAYMENT_RECEIVED").settlementOnly,false,"liquidação sem baixa prévia ainda baixa (modelo estrito)");
 const strict=plan("PAYMENT_CONFIRMED",{strictSettlement:true});
 assert.deepEqual([strict.settle,strict.markConfirmed],[false,true],"modelo estrito: baixa só na liquidação");
 assert.equal(plan("PAYMENT_CREDIT_CARD_CAPTURE_REFUSED").markRejected,true);
 assert.equal(plan("PAYMENT_REPROVED_BY_RISK_ANALYSIS").markRejected,true);
 assert.equal(plan("PAYMENT_REFUNDED").attention,"refund");assert.equal(plan("PAYMENT_PARTIALLY_REFUNDED").attention,"refund");
 for(const e of ["PAYMENT_CHARGEBACK_REQUESTED","PAYMENT_CHARGEBACK_DISPUTE","PAYMENT_AWAITING_CHARGEBACK_REVERSAL"]){
  assert.equal(plan(e).attention,"chargeback");assert.ok(isAsaasChargebackEvent(e));
  const a=buildAsaasChargebackAttention(e as never,"evt1",REC);
  assert.match(a.eventKey,/^asaas:evt1:chargeback_reconciliation$/);assert.ok(!/R\$|\d{3}\.\d{3}/.test(a.message),"sem valores nem dados do pagador");
 }
 // Pix mantém o modelo anterior: só PAYMENT_RECEIVED baixa; CONFIRMED não faz nada.
 const pix=cardWebhookPlan({eventType:"PAYMENT_CONFIRMED",isCard:false,chargeStatus:"pending",strictSettlement:false});
 assert.deepEqual([pix.settle,pix.markConfirmed],[false,false]);
 assert.equal(cardWebhookPlan({eventType:"PAYMENT_RECEIVED",isCard:false,chargeStatus:"pending",strictSettlement:false}).settle,true);
});

test("webhook: parcelas filhas sem efeito duplicado, marcos e líquido registrados, nunca estorno automático",()=>{
 const w=read("../src/app/api/integrations/asaas/webhook/route.ts");
 assert.match(w,/\.eq\("provider_installment_id", payload\.payment\.installment\)/);
 assert.match(w,/childInstallment/);
 assert.ok(w.indexOf("childInstallment = true")<w.indexOf("plan.settle"),"filha tratada antes de qualquer baixa");
 assert.match(w,/provider_settled_at/);assert.match(w,/gateway_net_amount/);assert.match(w,/provider_rejected_at/);
 assert.match(w,/isAsaasChargebackEvent\(eventType\)/);
 assert.doesNotMatch(w,/reverse|estornar_recibo|reversed_at|receivable_receipts/i,"nenhum estorno automático de recibo");
 assert.match(w,/onConflict: "payment_charge_id,notification_kind"/,"aviso WhatsApp continua idempotente");
 assert.match(w,/notifyAltnixReceivableCommit/,"autorização operacional reaproveitada após a baixa");
 // A liquidação de cartão já baixado devolve antes de qualquer aviso (sem recibo/aviso duplicados).
 assert.ok(w.indexOf("if (plan.settlementOnly)")<w.indexOf("notifyPaymentReceived({"));
});

test("migration: aditiva; uma cobrança pendente por título; recibo com a forma real; parcelamento configurável",()=>{
 const sql=readRoot("supabase/migrations/20261127190000_payment_charge_credit_card.sql");
 for(const c of ["payment_method","invoice_url","installment_count","provider_installment_id","provider_confirmed_at","provider_settled_at","provider_rejected_at","gateway_net_amount"])
  assert.match(sql,new RegExp(`add column if not exists ${c}\\b`));
 assert.match(sql,/payment_method in \('pix', 'credit_card'\)/);
 assert.match(sql,/payment_method = 'pix' and invoice_url is null and installment_count is null/);
 assert.match(sql,/credit_card_max_installments integer not null default 1 check \(credit_card_max_installments between 1 and 12\)/);
 assert.match(sql,/credit_card_min_installment_amount numeric\(12, 2\) not null default 5\.00 check \(credit_card_min_installment_amount >= 5\)/);
 assert.match(sql,/case when v_charge\.payment_method = 'credit_card' then 'credit_card' else 'pix' end/);
 assert.match(sql,/if v_charge\.status = 'paid' then/,"idempotência por status preservada");
 assert.match(sql,/create or replace function public\.confirm_payment_charge/);
 assert.doesNotMatch(sql,/\bdrop\s+(table|column|index)\b|\bdelete\s+from\b|\btruncate\b/i);
 assert.doesNotMatch(sql,/card_number|cvv|holder|pan\b/i,"nenhum dado de cartão");
 // O índice único de uma cobrança pendente por título é anterior e vale para qualquer forma.
 assert.match(readRoot("supabase/migrations/20261027100100_payment_charges.sql"),/payment_charges_one_pending_per_receivable[\s\S]*where status = 'pending'/);
});

// ------------------------------------------------------------------ provedor Asaas (fetch simulado)
test("provedor Asaas: cartão pela fatura hospedada, sem dados de cartão, com callback só quando informado",async()=>{
 const {createAsaasPixProvider}=await import("../src/lib/financeiro/asaasPixProvider");
 process.env.ASAAS_API_KEY_SANDBOX="$aact_sandbox_key_for_tests";process.env.ASAAS_ENV="sandbox";
 const settings={environment:"sandbox",enabled:true,allow_pix:true,allow_credit_card:true,credit_card_max_installments:6,credit_card_min_installment_amount:50,default_due_days:3};
 const clientRow={id:CLIENT,kind:"individual",full_name:"Maria Souza",company_name:null,trade_name:null,cpf:"12345678909",cnpj:null,whatsapp:"48991112222",phone_primary:null,email:"m@x.com",address_zip:null,address_street:null,address_number:null,address_complement:null,address_neighborhood:null,asaas_customer_id:"cus_1",asaas_customer_environment:"sandbox"};
 const db=(allowCard:boolean)=>({from:(table:string)=>({select:()=>({eq:()=>({single:async()=>({data:table==="billing_provider_settings"?{...settings,allow_credit_card:allowCard}:clientRow,error:null})})}),update:()=>({eq:async()=>({error:null})})})}) as never;
 const realFetch=globalThis.fetch;const sent:Array<{url:string;method:string;body:Record<string,unknown>|null}>=[];
 let invoiceUrl=INVOICE;let existing:unknown[]=[];
 globalThis.fetch=(async(url:string,init?:RequestInit)=>{
  const method=init?.method??"GET";sent.push({url,method,body:init?.body?JSON.parse(String(init.body)):null});
  const json=(v:unknown)=>new Response(JSON.stringify(v),{status:200});
  if(method==="GET"&&url.includes("/payments?externalReference"))return json({data:existing});
  if(method==="POST"&&url.endsWith("/payments"))return json({id:"pay_new",status:"PENDING",invoiceUrl,installment:sent.at(-1)!.body!.installmentCount?"inst_9":undefined});
  if(method==="DELETE")return json({deleted:true});
  return json({});
 }) as typeof fetch;
 try{
  const req={receivableId:REC,clientId:CLIENT,amount:600,description:"REC-1",installments:1};
  const cash=await createAsaasPixProvider(db(true)).createCardCharge!({...req,successUrl:"https://cliente.altnix.com.br/cl_x?finance=return&ref="+"a".repeat(32)});
  const post=sent.find(s=>s.method==="POST")!;
  assert.deepEqual(post.body,{customer:"cus_1",billingType:"CREDIT_CARD",value:600,dueDate:post.body!.dueDate,description:"REC-1",externalReference:`receivable:${REC}`,
   callback:{successUrl:"https://cliente.altnix.com.br/cl_x?finance=return&ref="+"a".repeat(32),autoRedirect:true}});
  assert.equal(cash.invoiceUrl,INVOICE);assert.equal(cash.providerChargeId,"pay_new");
  assert.ok(!JSON.stringify(sent).match(/creditCard|holderName|ccv|cardNumber|expiryMonth/i),"nenhum dado de cartão trafega");
  // Parcelado: installmentCount + totalValue (o total não muda) e sem callback quando não informado.
  sent.length=0;
  const split=await createAsaasPixProvider(db(true)).createCardCharge!({...req,installments:3});
  const body=sent.find(s=>s.method==="POST")!.body!;
  assert.equal(body.installmentCount,3);assert.equal(body.totalValue,600);assert.equal(body.value,undefined);assert.equal(body.callback,undefined);
  assert.equal(split.providerInstallmentId,"inst_9");
  // Regras locais antes de qualquer chamada.
  for(const bad of [{installments:7},{installments:0},{amount:100,installments:3}]){
   sent.length=0;
   await assert.rejects(()=>createAsaasPixProvider(db(true)).createCardCharge!({...req,...bad}));
   assert.equal(sent.some(s=>s.method==="POST"),false);
  }
  await assert.rejects(()=>createAsaasPixProvider(db(false)).createCardCharge!(req),"allow_credit_card desligado = indisponível");
  // Já existe cobrança ativa no provedor: concilia em vez de duplicar.
  existing=[{id:"pay_x",status:"PENDING",billingType:"PIX"}];sent.length=0;
  await assert.rejects(()=>createAsaasPixProvider(db(true)).createCardCharge!(req),/Já existe cobrança ativa/);
  assert.equal(sent.some(s=>s.method==="POST"),false);
  existing=[];
  // URL fora do Asaas: remove a cobrança criada e recusa.
  invoiceUrl="https://evil.example/i/x";sent.length=0;
  await assert.rejects(()=>createAsaasPixProvider(db(true)).createCardCharge!(req),/URL de pagamento confiável/);
  assert.ok(sent.some(s=>s.method==="DELETE"&&s.url.endsWith("/payments/pay_new")));
 }finally{globalThis.fetch=realFetch;}
});

test("recuperação de PIX nunca adota cobrança de cartão; parcelas do mesmo parcelamento contam como uma só cobrança ativa",async()=>{
 const {createAsaasPixProvider}=await import("../src/lib/financeiro/asaasPixProvider");
 process.env.ASAAS_API_KEY_SANDBOX="$aact_sandbox_key_for_tests";
 const db={from:(table:string)=>({select:()=>({eq:()=>({single:async()=>({data:table==="billing_provider_settings"?{environment:"sandbox",enabled:true,allow_pix:true,allow_credit_card:true,credit_card_max_installments:6,credit_card_min_installment_amount:50,default_due_days:3}:{},error:null})})})})} as never;
 const realFetch=globalThis.fetch;
 const list=(data:unknown[])=>{globalThis.fetch=(async()=>new Response(JSON.stringify({data}),{status:200})) as typeof fetch;};
 const req={receivableId:REC,clientId:CLIENT,amount:200};
 try{
  list([{id:"p1",status:"PENDING",billingType:"CREDIT_CARD",value:200,installment:"inst_1",installmentNumber:1},{id:"p2",status:"PENDING",billingType:"CREDIT_CARD",value:200,installment:"inst_1",installmentNumber:2}]);
  await assert.rejects(()=>createAsaasPixProvider(db).findActiveChargeForReceivable!(req),/outra modalidade/,"mesma fatura de cartão: uma só cobrança, mas nunca tratada como Pix");
  list([{id:"p1",status:"PENDING",billingType:"PIX",value:200},{id:"p2",status:"PENDING",billingType:"PIX",value:200}]);
  await assert.rejects(()=>createAsaasPixProvider(db).findActiveChargeForReceivable!(req),/mais de uma cobrança ativa/);
  list([{id:"p1",status:"PENDING",billingType:"CREDIT_CARD",value:100,installment:"inst_1"},{id:"p2",status:"PENDING",billingType:"CREDIT_CARD",value:100,installment:"inst_2"}]);
  await assert.rejects(()=>createAsaasPixProvider(db).findActiveChargeForReceivable!(req),/mais de uma cobrança ativa/,"parcelamentos distintos exigem conciliação");
 }finally{globalThis.fetch=realFetch;}
});

// ------------------------------------------------------------------ recibo, WhatsApp, contrato permanente, segurança
test("WhatsApp: confirmação por cartão usa o método real e não fica restrita a PIX",()=>{
 const paidReceivable={id:uuid(4),status:"paid",balance:0,dueDate:"2026-12-10",reference:"REC-1",excludedFromReports:false};
 const d=evaluateBatchCandidate({kind:"confirmation",now,portalUrl:"https://cliente.altnix.com.br",receivable:paidReceivable,
  client:{id:CLIENT,name:"Maria Souza",active:true,whatsapp:"(48) 99111-2222"},paidCharge:{status:"paid",amount:600,paymentMethod:"credit_card",providerChargeId:"pay_9"},recentSent:false});
 assert.equal(d.eligible,true);if(d.eligible)assert.equal(d.params[3],"Cartão de crédito");
 const pix=evaluateBatchCandidate({kind:"confirmation",now,portalUrl:"x",receivable:paidReceivable,client:{id:CLIENT,name:"Maria",active:true,whatsapp:"(48) 99111-2222"},paidCharge:{status:"paid",amount:1,providerChargeId:"p"},recentSent:false});
 if(pix.eligible)assert.equal(pix.params[3],"PIX");
 const actions=read("../src/app/sistema/financeiro/contas-a-receber/actions.ts");
 assert.match(actions,/paidCharge\.paymentMethod === "credit_card" \? "Cartão de crédito" : "PIX"/);
 assert.doesNotMatch(actions,/Nenhuma cobrança Pix paga/);
 const webhook=read("../src/app/api/integrations/asaas/webhook/route.ts");
 assert.match(webhook,/if \(billingType === "CREDIT_CARD"\) return "Cartão de crédito"/,"aviso automático já descreve o cartão");
});

test("segurança e escopo: nenhum dado de cartão em lugar algum, ativação em duas travas, outros fluxos e contrato permanente intocados",()=>{
 const files=[
  "../src/lib/financeiro/asaasPixProvider.ts","../src/lib/financeiro/cardPaymentUrls.ts","../src/lib/financeiro/cardWebhookPolicy.ts",
  "../src/lib/integrations/altnixFinancePayment.ts","../src/lib/integrations/financePaymentRuntime.ts",
  "../src/app/api/integrations/altnix/finance-payment/route.ts","../src/app/api/public/pagamento/[token]/metodo/route.ts",
  "../src/app/pagamento/[token]/page.tsx","../src/features/financeiro/PublicPaymentMethodPicker.tsx",
 ];
 for(const f of files){
  const src=read(f);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,""),/creditCard\s*[:=]|cardNumber|card_number|\bcvv\b|\bccv\b|holderName|expiryMonth|securityCode/i,f);
  assert.doesNotMatch(src,/ad_contracts|internal_permanent|altnix_apply_service_finance|altnix_queue_service_authorization/,f);
 }
 const runtime=read("../src/lib/integrations/financePaymentRuntime.ts");
 assert.match(runtime,/JORNALIR_FINANCE_CARD_ENABLED === "true" && Boolean\(settings\?\.enabled && settings\?\.allow_credit_card\)/);
 const route=read("../src/app/api/integrations/altnix/finance-payment/route.ts");
 assert.ok(route.indexOf("JORNALIR_FINANCE_PAYMENT_ENABLED")<route.indexOf("financeBridgeAuthorized("));
 assert.ok(route.indexOf("allowedFinanceClient(")<route.indexOf("runFinancePayment("));
 assert.match(runtime,/\.eq\("client_id", command\.canonicalClientId\)/,"titularidade");
 assert.match(runtime,/listReportExcludedReceivableIds/,"título de teste excluído");
 assert.match(runtime,/ASAAS_CARD_CALLBACK_ENABLED !== "true"/,"callback só quando o domínio estiver cadastrado");
 // Troca pública: desligada por padrão, token aleatório, intervalo mínimo, decisão única.
 const pub=read("../src/app/api/public/pagamento/[token]/metodo/route.ts");
 assert.match(pub,/JORNALIR_PUBLIC_METHOD_SWITCH_ENABLED !== "true"/);assert.match(pub,/COOLDOWN_MS/);assert.match(pub,/runFinancePayment\(/);
 assert.match(pub,/PUBLIC_TOKEN_PATTERN\.test\(token\)/);
 // Configuração: o guard fixo foi removido e a ativação continua sob controle do proprietário.
 const settings=read("../src/app/sistema/configuracoes/cobrancas/actions.ts");
 assert.doesNotMatch(settings,/allow_credit_card: false/);assert.match(settings,/allow_credit_card: input\.allowCreditCard/);
 assert.match(settings,/Habilite a integração Asaas antes de ativar o cartão/);
 // Página pública: cartão na mesma aba (link simples), sem janela nova nem iframe.
 const page=read("../src/app/pagamento/[token]/page.tsx");
 assert.doesNotMatch(page,/target="_blank"|<iframe|window\.open/);
 assert.match(read("../src/features/financeiro/PublicPaymentMethodPicker.tsx"),/window\.location\.assign\(target\)/);
 assert.doesNotMatch(read("../src/features/financeiro/PublicPaymentMethodPicker.tsx"),/window\.open|<iframe|target="_blank"/);
 // QR Pix não existe para cartão.
 assert.match(read("../src/app/api/public/pagamento/[token]/qrcode/route.ts"),/payment_method === "credit_card"/);
});
