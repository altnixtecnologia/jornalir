import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeBrazilWhatsappNumber,resolveClientWhatsappRecipient,WHATSAPP_RECIPIENT_MESSAGES} from "@ir/core";
import {DUPLICATE_SEND_WINDOW_MS,evaluateBillingSend,type BillingSendInput} from "../src/lib/notifications/billingSendGuard";

const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");

test("destinatário: só o WhatsApp canônico válido; ausente ou inválido = indisponível; sem fallback ao telefone principal",()=>{
 assert.deepEqual(resolveClientWhatsappRecipient({whatsapp:"(48) 99111-2222"}),{ok:true,national:"48991112222",e164:"5548991112222"});
 assert.deepEqual(resolveClientWhatsappRecipient({whatsapp:"+55 48 3333-4444"}),{ok:true,national:"4833334444",e164:"554833334444"});
 for(const bad of ["12345","(00) 99111-2222","abc"])assert.deepEqual(resolveClientWhatsappRecipient({whatsapp:bad}),{ok:false,reason:"whatsapp_invalid"});
 for(const empty of [null,undefined,"","   "])assert.deepEqual(resolveClientWhatsappRecipient({whatsapp:empty}),{ok:false,reason:"no_whatsapp"});
 // Um telefone principal enviado por engano nunca é usado.
 assert.deepEqual(resolveClientWhatsappRecipient({whatsapp:null,phonePrimary:"(48) 99888-7777"} as never),{ok:false,reason:"no_whatsapp"});
 for(const message of Object.values(WHATSAPP_RECIPIENT_MESSAGES))assert.match(message,/WhatsApp/);
 assert.match(WHATSAPP_RECIPIENT_MESSAGES.no_whatsapp,/não tem WhatsApp cadastrado/);
 assert.match(WHATSAPP_RECIPIENT_MESSAGES.whatsapp_invalid,/inválido/);
});

test("normalização brasileira: +55, pontuação, DDD válido, sem corrigir dígitos",()=>{
 assert.equal(normalizeBrazilWhatsappNumber("+55 (48) 99111-2222"),"48991112222");
 assert.equal(normalizeBrazilWhatsappNumber("5548991112222"),"48991112222");
 assert.equal(normalizeBrazilWhatsappNumber("48 3333-4444"),"4833334444");
 for(const bad of [null,undefined,"","abc","991112222","(00) 99111-2222","(10) 99111-2222","(48) 9911-122223","5548991112222333"])assert.equal(normalizeBrazilWhatsappNumber(bad as string),null,String(bad));
});

const now=Date.parse("2026-11-27T12:00:00Z");
const open:BillingSendInput["receivable"]={status:"open",balance:300,excludedFromReports:false};
const pending={status:"pending",amount:300,provider:"asaas",providerChargeId:"p",publicToken:"tok",expiresAt:"2026-12-01T02:59:59Z"};
const input=(over:Partial<BillingSendInput>):BillingSendInput=>({kind:"billing",receivable:open,charges:[pending],recentLogs:[],now,...over});

test("cobrança manual: Pix vigente de título aberto pode ser enviado; nenhuma cobrança é criada",()=>{
 const decision=evaluateBillingSend(input({}));
 assert.equal(decision.ok,true);
 assert.equal((decision as {charge:{publicToken:string}}).charge.publicToken,"tok");
});

test("cobrança manual: teste, quitado, cancelado, sem Pix, Pix expirado e reserva ambígua são barrados",()=>{
 const cases:Array<[Partial<BillingSendInput>,RegExp]>=[
  [{receivable:{...open,excludedFromReports:true}},/teste/],
  [{receivable:{...open,status:"paid",balance:0}},/quitado/],
  [{receivable:{...open,balance:0}},/quitado/],
  [{receivable:{...open,status:"cancelled"}},/cancelado/],
  [{charges:[]},/Gere uma cobrança Pix/],
  [{charges:[{...pending,publicToken:undefined}]},/Gere uma cobrança Pix/],
  [{charges:[{...pending,expiresAt:"2026-11-26T02:59:59Z"}]},/expirou/],
  [{charges:[{...pending,providerChargeId:undefined}]},/conciliação/],
 ];
 for(const [over,expected] of cases){
  const decision=evaluateBillingSend(input(over));
  assert.equal(decision.ok,false);assert.match((decision as {error:string}).error,expected);
 }
});

test("duplicidade: reenvio em poucos minutos é recusado; falha anterior e janela vencida não bloqueiam; tipos são independentes",()=>{
 const sentAt=(msAgo:number)=>new Date(now-msAgo).toISOString();
 const recent=[{status:"sent",message:"Olá, Maria. Segue a cobrança...",createdAt:sentAt(60_000)}];
 assert.equal(evaluateBillingSend(input({recentLogs:recent})).ok,false);
 assert.equal(evaluateBillingSend(input({recentLogs:[{...recent[0],status:"failed"}]})).ok,true,"falha permite novo envio manual");
 assert.equal(evaluateBillingSend(input({recentLogs:[{...recent[0],createdAt:sentAt(DUPLICATE_SEND_WINDOW_MS+1000)}]})).ok,true);
 const confirmation=[{status:"sent",message:"Pagamento confirmado: R$ 300,00 • REC-1",createdAt:sentAt(60_000)}];
 assert.equal(evaluateBillingSend(input({recentLogs:confirmation})).ok,true,"confirmação recente não bloqueia cobrança");
 const paid={status:"paid",amount:300,paidAt:"2026-11-27T10:00:00Z"};
 const confirm=(over:Partial<BillingSendInput>)=>evaluateBillingSend(input({kind:"confirmation",receivable:{...open,status:"paid",balance:0},charges:[paid],...over}));
 assert.equal(confirm({}).ok,true);
 assert.equal(confirm({recentLogs:confirmation}).ok,false);
 assert.equal(confirm({recentLogs:recent}).ok,true,"cobrança recente não bloqueia confirmação");
 assert.equal(confirm({charges:[pending]}).ok,false,"sem Pix pago não confirma");
 assert.equal(confirm({receivable:{...open,status:"paid",balance:0,excludedFromReports:true}}).ok,false,"teste nunca recebe confirmação");
});

test("envios manuais e automático do Jornal usam resolvedor e guard; teste fica fora da confirmação automática",()=>{
 const actions=read("../src/app/sistema/financeiro/contas-a-receber/actions.ts");
 assert.equal((actions.match(/resolveClientWhatsappRecipient\(/g)||[]).length,4,"envio, confirmação e as duas prévias wa.me");
 assert.doesNotMatch(actions,/clientRecord\.whatsapp \?\? clientRecord\.phonePrimary \?\? ""/);
 assert.match(actions,/O Pix desta cobrança expirou/);
 assert.equal((actions.match(/evaluateBillingSend\(/g)||[]).length,2);
 assert.doesNotMatch(actions,/clientRecord\.whatsapp \?\? clientRecord\.phonePrimary/);
 assert.match(actions,/listReportExcludedReceivableIds\(client\)/);
 const webhook=read("../src/app/api/integrations/asaas/webhook/route.ts");
 assert.match(webhook,/resolveClientWhatsappRecipient\(/);
 assert.doesNotMatch(webhook,/client\.whatsapp \|\| client\.phone_primary/);
 assert.ok(webhook.indexOf("listReportExcludedReceivableIds(admin)")<webhook.indexOf("billing_notification_dispatches"),"teste excluído antes de reservar o envio");
 assert.match(webhook,/onConflict: "payment_charge_id,notification_kind"/,"reserva idempotente preservada");
 const sendBilling=actions.slice(actions.indexOf("export async function sendBillingMessageAction"),actions.indexOf("export async function buildBillingMessagePreviewAction"));
 const sendConfirmation=actions.slice(actions.indexOf("export async function sendPaymentConfirmationAction"));
 for(const body of [sendBilling,sendConfirmation.slice(0,4000),webhook])assert.doesNotMatch(body,/\.createPixCharge\(|renewExpiredPixCharge/,"notificar nunca cria cobrança");
});
