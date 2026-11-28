import {test} from "node:test";
import assert from "node:assert/strict";
import {createHmac,randomUUID} from "node:crypto";
import {readFileSync,existsSync} from "node:fs";
import {
 TEMPLATE_DEFINITIONS,approvedTemplateName,readNotificationConfig,sanitizeTemplateParam,buildTemplateParams,EXPECTED_PARAM_COUNT,
 type NotificationConfig,type NotificationEvent,
} from "../src/lib/notifications/whatsappTemplates";
import {planDispatchRows,processClaimed,runCustomerNotificationCycle,type ClaimedRow,type FinanceCandidate,type Rpc,type Sender} from "../src/lib/notifications/notificationDispatcher";
import {WhatsappProviderError,classifyMetaRefusal,failureKind} from "../src/lib/notifications/whatsappErrors";
import {parseDeliveryEvents,verifyMetaSignature,webhookChallenge} from "../src/lib/notifications/whatsappWebhook";
import {evaluateBatchCandidate,maskWhatsapp,type BatchCandidateInput} from "../src/lib/notifications/financialBatchEligibility";

const root=new URL("../../..",import.meta.url);
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const sql=readFileSync(new URL("supabase/migrations/20261127170000_customer_notification_dispatch.sql",root),"utf8");

// ---------------------------------------------------------------- templates e configuração
const ALL_ENV={
 VERCEL_ENV:"production",WHATSAPP_AUTOMATIC_FINANCE_ENABLED:"true",JORNALIR_NOTIFICATION_TEST_CLASSIFICATION_DONE:"true",
 WHATSAPP_FINANCE_NOTIFICATIONS_SINCE:"2026-12-01",WHATSAPP_TEMPLATE_NEW_OBLIGATION:"nova_cobranca_ir",WHATSAPP_TEMPLATE_DUE_SOON:"lembrete_vencimento_ir",
 WHATSAPP_TEMPLATE_OVERDUE:"cobranca_em_atraso_ir",WHATSAPP_TEMPLATE_RECEIPT_AVAILABLE:"recibo_disponivel_ir",WHATSAPP_RECEIPT_PORTAL_READY:"true",
 WHATSAPP_TEMPLATE_SERVICE_SUSPENDED:"servico_suspenso_ir",WHATSAPP_TEMPLATE_SERVICE_RESTORED:"servico_restabelecido_ir",
} as Record<string,string>;

test("templates: definição coerente, nomes propostos únicos e parâmetros batendo com o texto",()=>{
 const names=new Set<string>();
 for(const d of Object.values(TEMPLATE_DEFINITIONS)){
  if(!d.existingApproved){assert.match(d.proposedName,/^[a-z0-9_]+$/);}
  if(d.body.includes("{{")){
   const placeholders=[...d.body.matchAll(/\{\{(\d+)\}\}/g)].map(m=>Number(m[1]));
   assert.deepEqual([...new Set(placeholders)].sort(),d.parameters.map((_,i)=>i+1),d.event);
   assert.ok(!/^\{\{1\}\}|\{\{\d\}\}$/.test(d.body.trim()),"Meta não aceita parâmetro no início/fim: "+d.event);
  }
  if(!d.existingApproved)names.add(d.proposedName);
 }
 assert.equal(names.size,6,"seis nomes novos distintos (recibo é compartilhado por automático e manual)");
 assert.equal(TEMPLATE_DEFINITIONS.manual_billing.existingApproved,true);
 assert.equal(TEMPLATE_DEFINITIONS.manual_confirmation.existingApproved,true);
 for(const e of ["new_obligation","due_soon","overdue","receipt_available","service_suspended","service_restored"] as const)assert.equal(TEMPLATE_DEFINITIONS[e].existingApproved,false,"propostas não aprovadas: "+e);
});

test("template ausente = evento desligado (sem texto livre); reaproveita só os aprovados existentes",()=>{
 for(const e of ["new_obligation","due_soon","overdue","receipt_available","service_suspended","service_restored","manual_receipt"] as NotificationEvent[])assert.equal(approvedTemplateName(e,{}),null,e);
 assert.equal(approvedTemplateName("manual_billing",{}),"fatura_disponivel");
 assert.equal(approvedTemplateName("manual_confirmation",{}),"confirmacao_pagamento_ir");
 assert.equal(approvedTemplateName("overdue",{WHATSAPP_TEMPLATE_OVERDUE:"  cobranca_em_atraso_ir "}),"cobranca_em_atraso_ir");
});

test("despacho automático: só liga com produção, chave mestra, classificação de testes, data de início e algum template",()=>{
 assert.equal(readNotificationConfig(ALL_ENV).enabled,true);
 for(const drop of ["VERCEL_ENV","WHATSAPP_AUTOMATIC_FINANCE_ENABLED","JORNALIR_NOTIFICATION_TEST_CLASSIFICATION_DONE","WHATSAPP_FINANCE_NOTIFICATIONS_SINCE"]){
  const env={...ALL_ENV};delete env[drop];assert.equal(readNotificationConfig(env).enabled,false,drop);
 }
 assert.equal(readNotificationConfig({...ALL_ENV,VERCEL_ENV:"preview"}).enabled,false);
 assert.equal(readNotificationConfig({...ALL_ENV,WHATSAPP_FINANCE_NOTIFICATIONS_SINCE:"amanhã"}).enabled,false);
 const none={...ALL_ENV};for(const k of Object.keys(none))if(k.startsWith("WHATSAPP_TEMPLATE_"))delete none[k];
 assert.equal(readNotificationConfig(none).enabled,false,"sem template aprovado nada liga");
 // Recibo só quando o portal realmente oferece recibo.
 assert.equal(readNotificationConfig({...ALL_ENV,WHATSAPP_RECEIPT_PORTAL_READY:"false"}).templates.receipt_available,null);
 assert.equal(readNotificationConfig(ALL_ENV).templates.receipt_available,"recibo_disponivel_ir");
});

test("agenda configurável com limites; sem lembrete recorrente por ciclo",()=>{
 const c=readNotificationConfig({...ALL_ENV,WHATSAPP_DUE_SOON_DAYS:"5",WHATSAPP_OVERDUE_REMINDER_DAYS:"1, 7, 15, 30, 7"});
 assert.equal(c.dueSoonDays,5);assert.deepEqual(c.overdueOffsets,[1,7,15],"no máximo três marcos, sem repetição");
 assert.equal(readNotificationConfig({...ALL_ENV,WHATSAPP_DUE_SOON_DAYS:"99"}).dueSoonDays,3);
 assert.deepEqual(readNotificationConfig({...ALL_ENV,WHATSAPP_OVERDUE_REMINDER_DAYS:"0,abc,-3"}).overdueOffsets,[1]);
 // O marco de atraso é um DIA exato (due_date = hoje - dias) e a ocorrência identifica o marco: nunca todo ciclo.
 assert.match(sql,/e\.due_date = p_today - o\.off/);assert.match(sql,/'overdue:' \|\| o\.off/);
 assert.match(sql,/e\.due_date = p_today \+ p_due_soon_days/);
});

test("parâmetros: ordem aprovada, quantidade exata, sanitização da Meta e nenhum dado interno",()=>{
 const ctx={name:"Maria da Silva",reference:"Contrato\nIR   2026\t1",amount:1234.5,dueDate:"2026-12-10",portalUrl:"https://cliente.altnix.com.br",paymentUrl:"https://controle.altnix.com.br/pagamento/tok",methodLabel:"PIX",transactionId:"pay_1"};
 for(const e of Object.keys(TEMPLATE_DEFINITIONS) as NotificationEvent[])assert.equal(buildTemplateParams(e,ctx).length,EXPECTED_PARAM_COUNT[e],e);
 assert.deepEqual(buildTemplateParams("overdue",ctx),["Maria","Contrato IR 2026 1",(1234.5).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),"10/12/2026"]);
 assert.deepEqual(buildTemplateParams("service_suspended",ctx),["Maria"]);
 assert.equal(buildTemplateParams("manual_billing",ctx)[4],"https://controle.altnix.com.br/pagamento/tok");
 assert.equal(sanitizeTemplateParam("a\n\n b   c"),"a b c");
 assert.equal(sanitizeTemplateParam("   "),"-");
 assert.ok(sanitizeTemplateParam("x".repeat(500)).length<=200);
 const joined=JSON.stringify(Object.keys(TEMPLATE_DEFINITIONS).map(e=>buildTemplateParams(e as NotificationEvent,ctx)));
 assert.ok(!/receivable|uuid|client_id|token=|secret/i.test(joined));
});

// ---------------------------------------------------------------- planejamento
const cfg=readNotificationConfig(ALL_ENV);
const cand=(over:Partial<FinanceCandidate>={}):FinanceCandidate=>({
 event_type:"due_soon",entity_type:"receivable",entity_id:randomUUID(),occurrence:"due_soon:3",client_id:randomUUID(),client_name:"Maria Souza",
 whatsapp:"(48) 99111-2222",reference:"Contrato 1",amount:300,due_date:"2026-12-10",event_date:"2026-12-10",...over});

test("planejamento: destinatário canônico válido; ausente/inválido vira 'skipped' com motivo; evento sem template nem entra",()=>{
 const rows=planDispatchRows([cand(),cand({whatsapp:null}),cand({whatsapp:"123"}),cand({event_type:"overdue",occurrence:"overdue:1"})],{...cfg,templates:{...cfg.templates,overdue:null}});
 assert.equal(rows.length,3,"atraso sem template não é planejado");
 assert.deepEqual(rows.map(r=>[r.status,r.status_reason,r.to_phone]),[["pending",null,"5548991112222"],["skipped","sem_whatsapp",null],["skipped","whatsapp_invalido",null]]);
 assert.ok(rows.every(r=>r.origin==="automatic"&&r.template_name==="lembrete_vencimento_ir"));
 assert.equal(rows[0].params.length,4);
 assert.deepEqual(rows[1].params,[]);
});

test("serviço: suspensão/restabelecimento usam só o nome e o WhatsApp canônico",()=>{
 const rows=planDispatchRows([{event_type:"service_suspended",entity_type:"service_outbox",entity_id:randomUUID(),occurrence:"effective",client_id:randomUUID(),client_name:"Loja X Ltda",whatsapp:"48991112222"}],cfg);
 assert.equal(rows[0].template_name,"servico_suspenso_ir");assert.deepEqual(rows[0].params,["Loja"]);assert.equal(rows[0].to_phone,"5548991112222");
});

// ---------------------------------------------------------------- modelo fiel (em memória) das funções SQL
type Row={id:string;event_type:string;entity_type:string;entity_id:string;occurrence:string;client_id:string;origin:string;batch_id:string|null;template_name:string;to_phone:string|null;params:unknown;
 status:string;status_reason:string|null;attempts:number;max_attempts:number;claim_token:string|null;call_started_at:number|null;claimed_at:number|null;provider_message_id:string|null;error_code:string|null;next_attempt_at:number};
function memoryDatabase(now:()=>number,candidates:()=>unknown[]){
 const rows:Row[]=[];const log:string[]=[];
 const rpc:Rpc=async(name,args)=>{
  log.push(name);
  if(name==="customer_notification_finance_candidates"){
   // como no SQL: candidatos já registrados não voltam
   return {data:candidates().filter((c:any)=>!rows.some(r=>r.event_type===c.event_type&&r.entity_id===c.entity_id&&r.occurrence===c.occurrence&&r.client_id===c.client_id)),error:null};
  }
  if(name==="customer_notification_service_candidates")return {data:[],error:null};
  if(name==="customer_notification_enqueue"){
   let n=0;for(const x of args.p_rows as any[]){
    if(rows.some(r=>r.event_type===x.event_type&&r.entity_id===x.entity_id&&r.occurrence===x.occurrence&&r.client_id===x.client_id))continue;
    rows.push({id:randomUUID(),...x,status:x.status==="skipped"?"skipped":"pending",attempts:0,max_attempts:3,claim_token:null,call_started_at:null,claimed_at:null,provider_message_id:null,error_code:null,next_attempt_at:0});n++;
   }
   return {data:n,error:null};
  }
  if(name==="customer_notification_claim"){
   const out:Row[]=[];
   for(const r of rows){ // recuperação de processamento abandonado
    if(r.origin===args.p_origin&&r.status==="processing"&&r.claimed_at!==null&&r.claimed_at<now()-15*60_000){r.status=r.call_started_at===null?"pending":"uncertain";r.claim_token=null;r.claimed_at=null;}
   }
   for(const r of rows){
    if(out.length>=(args.p_limit as number))break;
    if(r.origin===args.p_origin&&r.status==="pending"&&r.next_attempt_at<=now()&&(!args.p_batch||r.batch_id===args.p_batch)){
     r.status="processing";r.claim_token=randomUUID();r.claimed_at=now();r.call_started_at=null;r.attempts+=1;out.push(r);
    }
   }
   return {data:out.map(r=>({id:r.id,claim_token:r.claim_token,template_name:r.template_name,to_phone:r.to_phone,params:r.params,event_type:r.event_type,entity_id:r.entity_id,attempts:r.attempts})),error:null};
  }
  if(name==="customer_notification_mark_call_started"){
   const r=rows.find(x=>x.id===args.p_id&&x.claim_token===args.p_token&&x.status==="processing"&&x.call_started_at===null);
   if(r)r.call_started_at=now();return {data:Boolean(r),error:null};
  }
  if(name==="customer_notification_finish"){
   const r=rows.find(x=>x.id===args.p_id&&x.claim_token===args.p_token&&x.status==="processing");
   if(!r)return {data:null,error:null};
   const o=args.p_outcome as string;
   r.status=o==="accepted"?"accepted":o==="uncertain"?"uncertain":o==="skipped"?"skipped":o==="failed"?"failed":(r.attempts<r.max_attempts?"pending":"failed");
   r.claim_token=null;r.claimed_at=null;
   if(o==="accepted")r.provider_message_id=args.p_provider_message_id as string;
   if(r.status==="pending")r.next_attempt_at=now()+10*60_000*r.attempts;
   return {data:r.status,error:null};
  }
  return {data:null,error:{message:"rpc desconhecida: "+name}};
 };
 return {rows,rpc,log};
}
const okSender=(calls:string[]):Sender=>async(t,to)=>{calls.push(`${t}:${to}`);return {providerMessageId:"wamid."+calls.length};};

test("ciclo desligado: nenhuma consulta nem chamada ao provedor (sem custo)",async()=>{
 const db=memoryDatabase(()=>0,()=>[cand()]);const calls:string[]=[];
 const off=await runCustomerNotificationCycle({rpc:db.rpc,send:okSender(calls),config:{...cfg,enabled:false},now:new Date(),providerConfigured:true});
 assert.equal(off.status,"disabled");assert.deepEqual(db.log,[]);assert.deepEqual(calls,[]);
 const noProvider=await runCustomerNotificationCycle({rpc:db.rpc,send:okSender(calls),config:cfg,now:new Date(),providerConfigured:false});
 assert.equal(noProvider.status,"disabled");assert.deepEqual(db.log,[]);
});

test("ciclo: uma consulta em lote, envio com template aprovado, e a mesma ocorrência nunca é reenviada",async()=>{
 let clock=1_000_000;const db=memoryDatabase(()=>clock,()=>[cand({entity_id:"11111111-1111-4111-8111-111111111111",client_id:"22222222-2222-4222-8222-222222222222"})]);
 const calls:string[]=[];
 const first=await runCustomerNotificationCycle({rpc:db.rpc,send:okSender(calls),config:cfg,now:new Date("2026-12-07T12:00:00Z"),providerConfigured:true,clock:()=>clock});
 assert.equal(first.status,"ok");assert.equal(first.enqueued,1);assert.equal(first.counts.accepted,1);
 assert.deepEqual(calls,["lembrete_vencimento_ir:5548991112222"]);
 assert.equal(db.log.filter(n=>n==="customer_notification_finance_candidates").length,1,"uma consulta em lote por ciclo");
 assert.equal(db.rows[0].status,"accepted");assert.ok(db.rows[0].provider_message_id);
 // Segundo ciclo (mesmo dia ou seguinte): o evento já está registrado — nada novo, nenhuma chamada.
 clock+=3_600_000;
 const second=await runCustomerNotificationCycle({rpc:db.rpc,send:okSender(calls),config:cfg,now:new Date("2026-12-07T13:00:00Z"),providerConfigured:true,clock:()=>clock});
 assert.equal(second.enqueued,0);assert.equal(second.counts.claimed,0);assert.equal(calls.length,1,"sem repetição a cada ciclo");
 // Mesmo que um candidato duplicado volte, o índice único (modelado) impede segunda linha.
 await db.rpc("customer_notification_enqueue",{p_rows:[{...db.rows[0]}]});
 assert.equal(db.rows.length,1);
});

test("nova tentativa limitada só para recusa transitória; definitiva e ambígua nunca são repetidas às cegas",async()=>{
 const scenarios:Array<[string,()=>Error,number,string]>=[
  ["transitória",()=>new WhatsappProviderError("429","retryable",429,"130429"),3,"failed"],
  ["definitiva",()=>new WhatsappProviderError("número inválido","permanent",400,"131026"),1,"failed"],
  ["ambígua",()=>new WhatsappProviderError("timeout","ambiguous"),1,"uncertain"],
  ["falha local desconhecida",()=>new Error("boom"),1,"uncertain"],
 ];
 for(const [label,makeError,expectedCalls,finalStatus] of scenarios){
  const stable=cand();let clock=0;const db=memoryDatabase(()=>clock,()=>[stable]);let calls=0;
  const failing:Sender=async()=>{calls+=1;throw makeError();};
  for(let cycle=0;cycle<8;cycle++){
   await runCustomerNotificationCycle({rpc:db.rpc,send:failing,config:cfg,now:new Date(),providerConfigured:true,clock:()=>clock});
   clock+=24*3_600_000;
  }
  assert.equal(calls,expectedCalls,label);assert.equal(db.rows[0].status,finalStatus,label);
 }
});

test("destinatário inválido: registrado como ignorado, sem chamada ao provedor",async()=>{
 const db=memoryDatabase(()=>0,()=>[cand({whatsapp:null})]);const calls:string[]=[];
 const r=await runCustomerNotificationCycle({rpc:db.rpc,send:okSender(calls),config:cfg,now:new Date(),providerConfigured:true,clock:()=>0});
 assert.equal(db.rows[0].status,"skipped");assert.equal(db.rows[0].status_reason,"sem_whatsapp");assert.deepEqual(calls,[]);assert.equal(r.counts.claimed,0);
});

test("reivindicação atômica: duas execuções simultâneas nunca enviam a mesma linha",async()=>{
 const db=memoryDatabase(()=>0,()=>[]);
 const rows=Array.from({length:6},()=>planDispatchRows([cand()],cfg)[0]);
 await db.rpc("customer_notification_enqueue",{p_rows:rows});
 const [a,b]=await Promise.all([db.rpc("customer_notification_claim",{p_origin:"automatic",p_limit:4}),db.rpc("customer_notification_claim",{p_origin:"automatic",p_limit:4})]);
 const ids=[...(a.data as any[]),...(b.data as any[])].map(x=>x.id);
 assert.equal(ids.length,6);assert.equal(new Set(ids).size,6,"sem sobreposição");
});

test("interrupção: sem chamada ao provedor volta à fila; após a chamada vira incerto (nunca reenvio automático)",async()=>{
 let clock=1_000_000;const db=memoryDatabase(()=>clock,()=>[]);
 await db.rpc("customer_notification_enqueue",{p_rows:planDispatchRows([cand(),cand()],cfg)});
 const claimed=(await db.rpc("customer_notification_claim",{p_origin:"automatic",p_limit:10})).data as ClaimedRow[];
 // Linha A: processo caiu ANTES de chamar o provedor. Linha B: caiu DEPOIS de iniciar a chamada.
 await db.rpc("customer_notification_mark_call_started",{p_id:claimed[1].id,p_token:claimed[1].claim_token});
 clock+=16*60_000;
 const reclaimed=(await db.rpc("customer_notification_claim",{p_origin:"automatic",p_limit:10})).data as ClaimedRow[];
 assert.deepEqual(reclaimed.map(r=>r.id),[claimed[0].id],"só a que não chegou ao provedor é reenfileirada");
 assert.equal(db.rows.find(r=>r.id===claimed[1].id)!.status,"uncertain");
});

test("orçamento de tempo: o que não coube fica recuperável (não é perdido nem reenviado)",async()=>{
 const db=memoryDatabase(()=>0,()=>[]);
 await db.rpc("customer_notification_enqueue",{p_rows:planDispatchRows([cand(),cand(),cand()],cfg)});
 const claimed=(await db.rpc("customer_notification_claim",{p_origin:"automatic",p_limit:10})).data as ClaimedRow[];
 const calls:string[]=[];let tick=0;
 const counts=await processClaimed(db.rpc,okSender(calls),claimed,2,()=>{tick+=1;return tick;});
 assert.equal(counts.accepted,2);assert.equal(counts.deferred,1);assert.equal(calls.length,2);
});

test("classificação de falhas do provedor",()=>{
 assert.equal(classifyMetaRefusal(429),"retryable");assert.equal(classifyMetaRefusal(503),"retryable");assert.equal(classifyMetaRefusal(400,130429),"retryable");
 assert.equal(classifyMetaRefusal(400,131026),"permanent");assert.equal(classifyMetaRefusal(400,132000),"permanent");assert.equal(classifyMetaRefusal(401),"permanent");
 assert.equal(failureKind(new WhatsappProviderError("x","retryable")),"retryable");assert.equal(failureKind(new Error("x")),"ambiguous");
 const provider=read("../src/lib/financeiro/whatsappCloudProvider.ts");
 assert.match(provider,/AbortSignal\.timeout\(15000\)/);assert.match(provider,/"ambiguous"/);assert.match(provider,/classifyMetaRefusal\(/);
});

// ---------------------------------------------------------------- callback de entrega
const APP_SECRET="app-secret-with-32-characters-ok!!";
const sign=(body:string,secret=APP_SECRET)=>"sha256="+createHmac("sha256",secret).update(body).digest("hex");

test("callback: assinatura autêntica sobre o corpo bruto; adulterado, sem cabeçalho ou sem segredo é recusado",()=>{
 const body=JSON.stringify({entry:[]});
 assert.equal(verifyMetaSignature(body,sign(body),APP_SECRET),true);
 assert.equal(verifyMetaSignature(body+" ",sign(body),APP_SECRET),false,"corpo adulterado");
 assert.equal(verifyMetaSignature(body,sign(body,"outro-segredo-qualquer-123456"),APP_SECRET),false);
 assert.equal(verifyMetaSignature(body,null,APP_SECRET),false);assert.equal(verifyMetaSignature(body,"sha256=xyz",APP_SECRET),false);
 assert.equal(verifyMetaSignature(body,sign(body),undefined),false);assert.equal(verifyMetaSignature(body,sign(body),"curto"),false);
 const p=new URLSearchParams({"hub.mode":"subscribe","hub.verify_token":"verify-token-1234567","hub.challenge":"abc123"});
 assert.equal(webhookChallenge(p,"verify-token-1234567"),"abc123");
 assert.equal(webhookChallenge(p,"outro-token-12345678"),null);assert.equal(webhookChallenge(p,undefined),null);
 assert.equal(webhookChallenge(new URLSearchParams({"hub.mode":"unsubscribe","hub.verify_token":"verify-token-1234567","hub.challenge":"x"}),"verify-token-1234567"),null);
});

test("callback: extrai somente status conhecidos; ignora mensagens recebidas e dados inválidos",()=>{
 const payload={entry:[{changes:[{value:{statuses:[
  {id:"wamid.1",status:"sent",timestamp:"1796000000"},{id:"wamid.1",status:"delivered",timestamp:"1796000010"},{id:"wamid.1",status:"read",timestamp:"1796000020"},
  {id:"wamid.2",status:"failed",timestamp:"1796000030",errors:[{code:131026,title:"Message undeliverable"}]},
  {id:"wamid.3",status:"deleted",timestamp:"1796000040"},{id:"",status:"sent",timestamp:"1796000050"},{id:"wamid.4",status:"sent",timestamp:"abc"},
 ]}},{value:{messages:[{from:"5548999999999",text:{body:"oi"}}]}}]}]};
 const events=parseDeliveryEvents(payload);
 assert.deepEqual(events.map(e=>[e.messageId,e.status]),[["wamid.1","sent"],["wamid.1","delivered"],["wamid.1","read"],["wamid.2","failed"]]);
 assert.equal(events[3].errorCode,"131026");assert.match(events[0].at,/^2026-/);
 assert.deepEqual(parseDeliveryEvents(null),[]);assert.deepEqual(parseDeliveryEvents({entry:"x"}),[]);
 const many={entry:[{changes:[{value:{statuses:Array.from({length:500},(_,i)=>({id:"w"+i,status:"sent",timestamp:"1796000000"}))}}]}]};
 assert.equal(parseDeliveryEvents(many).length,200,"limite por requisição");
});

test("callback: rota desligada por padrão, assinatura antes do processamento, erro de banco devolve 500 para a Meta reenviar",()=>{
 const route=read("../src/app/api/integrations/whatsapp/webhook/route.ts");
 assert.match(route,/WHATSAPP_WEBHOOK_ENABLED === "true"/);
 assert.ok(route.indexOf("verifyMetaSignature(")<route.indexOf("JSON.parse(raw)"),"autentica antes de interpretar");
 assert.ok(route.indexOf("verifyMetaSignature(")<route.indexOf("whatsapp_apply_delivery_event"));
 assert.match(route,/if \(error\) return NextResponse\.json\(\{ error: "Falha ao registrar\." \}, \{ status: 500/);
 assert.doesNotMatch(route,/fetch\(|graph\.facebook\.com/,"não chama nem configura o provedor");
 // Estados no banco: entrega só por evento do provedor; falha não sobrescreve entrega; duplicado e fora de ordem tolerados.
 assert.match(sql,/unique \(provider_message_id, status, provider_timestamp\)/);
 assert.match(sql,/on conflict \(provider_message_id, status, provider_timestamp\) do nothing/);
 assert.match(sql,/where id = d\.id and status in \('processing','accepted','uncertain'\);/,"failed só antes de entrega/leitura");
 assert.match(sql,/where id = d\.id and status <> 'read'/);
});

// ---------------------------------------------------------------- migration
test("migration: registro durável, chave de idempotência, reivindicação segura e histórico preservado",()=>{
 assert.match(sql,/create unique index customer_notification_dispatches_event_once\s+on public\.customer_notification_dispatches \(event_type, entity_id, occurrence, client_id\)/);
 for(const s of ["pending","processing","accepted","delivered","read","failed","uncertain","skipped"])assert.match(sql,new RegExp(`'${s}'`));
 assert.match(sql,/for update skip locked/);
 assert.match(sql,/call_started_at is null then 'pending' else 'uncertain'/);
 assert.match(sql,/d\.attempts < d\.max_attempts then 'pending' else 'failed'/,"nova tentativa limitada");
 assert.match(sql,/least\(attempts \+ 1, 6\)/,"reenvio manual limitado");
 assert.doesNotMatch(sql,/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b/i,"histórico nunca apagado");
 assert.match(sql,/revoke all on public\.customer_notification_dispatches from public, anon, authenticated/);
 assert.match(sql,/report_excluded_at is null/,"título de teste fora");
 assert.match(sql,/client_digital_export_permissions/,"escopo inicial: clientes integrados");
 assert.match(sql,/o\.delivered_at is not null/,"suspensão/restabelecimento só com estado efetivo");
 assert.match(sql,/o\.decision_origin = 'finance'/);
 assert.match(sql,/o\.revision = \(select max\(t\.revision\)/,"aviso obsoleto não é enviado");
 assert.match(sql,/status in \('draft','sending','sent'\)/);
 assert.match(sql,/status in \('pending','sending','sent','failed','skipped','uncertain'\)/);
 assert.equal((sql.match(/not exists \(select 1 from public\.customer_notification_dispatches/g)||[]).length,5,"candidatos já registrados não voltam");
 const files=existsSync(new URL("apps/sistema/vercel.json",root))?read("../vercel.json"):"";
 assert.doesNotMatch(files,/"crons"/,"nenhum cron novo");
});

test("propriedade dos eventos: confirmação segue no webhook (ledger próprio) e o ciclo roda na rotina diária existente",()=>{
 const cron=read("../src/app/api/cron/altnix-service-finance/route.ts");
 assert.match(cron,/runDailyServiceFinance\(/);assert.match(cron,/readNotificationConfig\(process\.env\)/);
 assert.ok(cron.indexOf("runDailyServiceFinance(")<cron.indexOf("runCustomerNotificationCycle("),"estado financeiro confirmado antes dos avisos");
 assert.match(cron,/catch\{notifications=\{status:"error"/,"falha nos avisos não altera o resultado financeiro");
 const webhook=read("../src/app/api/integrations/asaas/webhook/route.ts");
 assert.match(webhook,/billing_notification_dispatches/);
 assert.doesNotMatch(JSON.stringify(Object.keys(TEMPLATE_DEFINITIONS)),/payment_confirmed/,"confirmação automática não duplicada no novo ciclo");
 const dispatcher=read("../src/lib/notifications/notificationDispatcher.ts");
 assert.doesNotMatch(dispatcher,/createPixCharge|renewExpiredPixCharge|\.insert\(|\.update\(/,"notificar nunca cria cobrança nem escreve diretamente");
});

// ---------------------------------------------------------------- lote manual de títulos
const NOW=Date.parse("2026-12-07T12:00:00Z");
const pix={status:"pending",amount:300,provider:"asaas",providerChargeId:"p",publicToken:"tok",expiresAt:"2026-12-20T02:59:59Z"};
const input=(over:Partial<BatchCandidateInput>):BatchCandidateInput=>({
 kind:"billing",now:NOW,portalUrl:"https://cliente.altnix.com.br",
 receivable:{id:randomUUID(),status:"open",balance:300,dueDate:"2026-12-10",reference:"Contrato 1",excludedFromReports:false},
 client:{id:randomUUID(),name:"Maria Souza",active:true,whatsapp:"(48) 99111-2222"},
 pendingCharge:pix,paidCharge:null,receipt:null,recentSent:false,...over});

test("lote manual: regras por tipo — a restrição de título em aberto vale só para cobrança",()=>{
 const paidReceivable={status:"paid",balance:0};
 const billing=evaluateBatchCandidate(input({}));assert.equal(billing.eligible,true);
 assert.equal(evaluateBatchCandidate(input({receivable:{...input({}).receivable,...paidReceivable}})).eligible,false,"cobrança de título quitado");
 const confirmation=evaluateBatchCandidate(input({kind:"confirmation",receivable:{...input({}).receivable,...paidReceivable},pendingCharge:null,paidCharge:{status:"paid",amount:300,providerChargeId:"pay_1"}}));
 assert.equal(confirmation.eligible,true,"confirmação exige título pago, não aberto");
 assert.equal(evaluateBatchCandidate(input({kind:"confirmation",paidCharge:null})).eligible,false,"sem pagamento confirmado");
 const receipt=evaluateBatchCandidate(input({kind:"receipt",receivable:{...input({}).receivable,...paidReceivable},pendingCharge:null,receipt:{id:randomUUID(),amount:300,reversed:false}}));
 assert.equal(receipt.eligible,true);assert.equal(receipt.eligible&&receipt.entityType,"receipt");
 assert.equal(evaluateBatchCandidate(input({kind:"receipt",receipt:{id:randomUUID(),amount:300,reversed:true}})).eligible,false,"recibo estornado");
 assert.equal(evaluateBatchCandidate(input({kind:"receipt",receipt:null})).eligible,false);
});

test("lote manual: Pix precisa existir e estar vigente; teste, cliente inativo e WhatsApp inválido são barrados",()=>{
 const reasons=(over:Partial<BatchCandidateInput>)=>{const d=evaluateBatchCandidate(input(over));assert.equal(d.eligible,false);return (d as {reason:string}).reason;};
 assert.match(reasons({pendingCharge:null}),/Sem Pix vigente/);
 assert.match(reasons({pendingCharge:{...pix,publicToken:undefined}}),/Sem Pix vigente/);
 assert.match(reasons({pendingCharge:{...pix,expiresAt:"2026-12-01T00:00:00Z"}}),/expirou/);
 assert.match(reasons({pendingCharge:{...pix,providerChargeId:undefined}}),/conciliação/);
 assert.match(reasons({receivable:{...input({}).receivable,excludedFromReports:true}}),/teste/);
 assert.match(reasons({client:{...input({}).client,active:false}}),/inativo/);
 assert.match(reasons({client:{...input({}).client,whatsapp:null}}),/não tem WhatsApp cadastrado/);
 assert.match(reasons({client:{...input({}).client,whatsapp:"123"}}),/inválido/);
 assert.match(reasons({recentSent:true}),/já enviada ou em andamento hoje/);
});

test("lote manual: mensagem individual com WhatsApp mascarado e parâmetros do cliente; sem grupo",()=>{
 const d=evaluateBatchCandidate(input({}));
 assert.equal(d.eligible,true);
 if(d.eligible){
  assert.equal(d.e164,"5548991112222");assert.equal(d.phoneMasked,"(48) •••••-2222");assert.equal(maskWhatsapp("48991112222"),"(48) •••••-2222");
  assert.equal(d.params[0],"Maria");assert.equal(d.params.length,5);assert.equal(d.params[4],"https://controle.altnix.com.br/pagamento/tok");
 }
 const actions=read("../src/app/sistema/financeiro/avisos/actions.ts");
 assert.doesNotMatch(actions,/\.createPixCharge\(|renewExpiredPixCharge|group|grupo/i,"nunca cria cobrança nem grupo");
 assert.match(actions,/checkFinanceAction\("pix_enviar"\)/);
 assert.match(actions,/listReportExcludedReceivableIds\(db\)/);
 assert.match(actions,/loadBase\(caller\.db, input\.kind, \{ ids: keys \}\)/,"reconfere tudo no servidor ao enviar");
 assert.match(actions,/approvedTemplateName\(event, process\.env\)/);
 assert.match(actions,/p_origin: "manual"/);
 assert.doesNotMatch(actions,/e164:\s*input\./,"o número nunca vem do navegador");
 const panel=read("../src/features/financeiro/FinancialNotificationBatchPanel.tsx");
 assert.match(panel,/confirmDialog/);assert.match(panel,/Aceito pela Meta|aceito pela Meta/);assert.match(panel,/Reenviar mesmo assim/);assert.doesNotMatch(panel,/status === "delivered"/);
});

test("política de destinatário aplicada em todos os pontos do Jornal (sem telefone principal)",()=>{
 const files=[
  "../src/app/sistema/financeiro/contas-a-receber/actions.ts","../src/app/api/integrations/asaas/webhook/route.ts",
  "../src/app/sistema/assinaturas/avisos-vencimento/actions.ts","../src/app/sistema/financeiro/avisos/actions.ts",
  "../src/lib/notifications/financialBatchEligibility.ts","../src/lib/notifications/notificationDispatcher.ts",
 ];
 for(const f of files){
  const src=read(f);
  assert.doesNotMatch(src,/phonePrimary|phone_primary/,f);
  assert.doesNotMatch(src,/whatsapp\s*(\?\?|\|\|)\s*[\w.]*phone/i,f);
 }
 assert.doesNotMatch(readFileSync(new URL("packages/core/src/clientes/whatsapp-recipient.ts",root),"utf8").replace(/\/\*[\s\S]*?\*\//g,""),/phonePrimary|phone_primary|isBrazilMobile/);
});
