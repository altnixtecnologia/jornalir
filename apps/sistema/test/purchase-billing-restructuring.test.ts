import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 PaymentChargeAlreadyPendingError,PaymentChargeService,
 allocateProportionally,addMonthsIso,scheduleInstallments,planConsolidation,planSplit,validateRestructuring,sumByService,
 assessServiceObligations,effectiveGraceDays,RestructureValidationError,
 type PaymentChargeRepository,type PixProvider,type RestructureSource,type ServiceObligation,
} from "@ir/core";
import type {PaymentCharge} from "@ir/types";
import {
 parseRestructureCommand,runRestructuring,type RestructureCommand,type RestructureDeps,type SourceRow,
} from "../src/lib/financeiro/receivableRestructuring";
import {assessServiceObligations as _unused} from "@ir/core";
void _unused;

const root=new URL("../../..",import.meta.url);
const readRoot=(p:string)=>readFileSync(new URL(p,root),"utf8");
const readApp=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const uuid=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const CLIENT=uuid(1),OTHER=uuid(2),SVC_A=uuid(11),SVC_B=uuid(12),SVC_C=uuid(13);
const TODAY="2026-12-10";
const src=(id:number,cents:number,allocs:Array<[string,number]>,client=CLIENT):RestructureSource=>({id:uuid(id),clientId:client,outstandingCents:cents,allocations:allocs.map(([serviceId,c])=>({serviceId,cents:c}))});

// ------------------------------------------------------------------ alocação e arredondamento (centavos)
test("alocação proporcional: soma exata, maior resto, desempate determinístico, sem ponto flutuante",()=>{
 assert.deepEqual(allocateProportionally(100,[1,1,1]),[34,33,33],"centavo extra vai ao primeiro em empate");
 assert.deepEqual(allocateProportionally(1000,[600,400]),[600,400]);
 assert.deepEqual(allocateProportionally(1,[1,1]),[1,0]);
 for(const [total,weights] of [[999_999_999_99,[333,333,334]],[7,[3,3,1]],[12345678901,[1,2,3,4,5]],[5,[0,5,0]]] as Array<[number,number[]]>){
  const out=allocateProportionally(total,weights);
  assert.equal(out.reduce((a,b)=>a+b,0),total,"conserva o total");
  assert.ok(out.every(v=>Number.isInteger(v)&&v>=0));
  assert.deepEqual(allocateProportionally(total,weights),out,"determinístico");
  weights.forEach((w,i)=>{if(w===0)assert.equal(out[i],0,"peso zero nunca recebe dívida");});
 }
 assert.throws(()=>allocateProportionally(10,[0,0]),RestructureValidationError);
 assert.throws(()=>allocateProportionally(-1,[1]),RestructureValidationError);
 assert.throws(()=>allocateProportionally(1.5,[1]),RestructureValidationError);
 assert.deepEqual(allocateProportionally(0,[0,0]),[0,0]);
});

test("datas de parcelas: fim de mês limitado, virada de ano, UTC (sem deslocamento de fuso)",()=>{
 assert.equal(addMonthsIso("2026-01-31",1),"2026-02-28");assert.equal(addMonthsIso("2028-01-31",1),"2028-02-29");
 assert.equal(addMonthsIso("2026-11-30",3),"2027-02-28");assert.equal(addMonthsIso("2026-12-10",12),"2027-12-10");
 assert.throws(()=>addMonthsIso("10/12/2026",1),RestructureValidationError);
});

// ------------------------------------------------------------------ planos de unificar/dividir
test("unificar: soma por serviço, parcelamento conserva cada serviço e o total, linhagem preservada nas alocações",()=>{
 const a=src(21,100_000,[[SVC_A,60_000],[SVC_B,40_000]]);
 const b=src(22,50_000,[[SVC_C,50_000]]);
 const targets=planConsolidation([a,b],{installments:3,firstDueDate:"2026-12-20"},"Unificação",TODAY);
 assert.equal(targets.length,3);
 assert.deepEqual(targets.map(t=>t.dueDate),["2026-12-20","2027-01-20","2027-02-20"]);
 const totals=new Map(sumByService(targets.flatMap(t=>t.allocations)).map(l=>[l.serviceId,l.cents]));
 assert.deepEqual([totals.get(SVC_A),totals.get(SVC_B),totals.get(SVC_C)],[60_000,40_000,50_000],"cada serviço conserva o valor");
 assert.equal(targets.reduce((s,t)=>s+t.allocations.reduce((x,l)=>x+l.cents,0),0),150_000);
 assert.doesNotThrow(()=>validateRestructuring([a,b],targets,TODAY));
 assert.throws(()=>planConsolidation([a],{installments:1,firstDueDate:"2026-12-20"},"x",TODAY),/ao menos duas/);
});

test("dividir: por compra de origem e por serviço; só o saldo em aberto; sem alocação negativa, duplicada ou órfã",()=>{
 const a=src(21,100_000,[[SVC_A,60_000],[SVC_B,40_000]]);
 const bySource=planSplit([a,src(22,50_000,[[SVC_C,50_000]])],"by_source",{installments:1,firstDueDate:"2026-12-20"},"Divisão",TODAY);
 assert.equal(bySource.length,2);
 const byService=planSplit([a],"by_service",{installments:2,firstDueDate:"2026-12-20"},"Divisão",TODAY);
 assert.equal(byService.length,4,"dois serviços × duas parcelas");
 assert.equal(byService.every(t=>t.allocations.length===1),true,"cada cobrança resultante paga um serviço");
 assert.doesNotThrow(()=>validateRestructuring([a],byService,TODAY));
 assert.throws(()=>planSplit([src(23,50_000,[[SVC_C,50_000]])],"by_source",{installments:1,firstDueDate:"2026-12-20"},"x",TODAY),/ao menos duas/);
 // Conservação: qualquer desvio de centavos é recusado.
 const tampered=byService.map((t,i)=>i===0?{...t,allocations:[{...t.allocations[0],cents:t.allocations[0].cents+1}]}:t);
 assert.throws(()=>validateRestructuring([a],tampered,TODAY),/conserva/);
 const negative=byService.map((t,i)=>i===0?{...t,allocations:[{...t.allocations[0],cents:-5}]}:t);
 assert.throws(()=>validateRestructuring([a],negative,TODAY));
 const duplicate=[{...bySource[0],allocations:[...bySource[0].allocations,bySource[0].allocations[0]]}];
 assert.throws(()=>validateRestructuring([a],duplicate,TODAY),/repetido|conserva/);
 const orphan=byService.map((t,i)=>i===0?{...t,allocations:[{serviceId:uuid(99),cents:t.allocations[0].cents}]}:t);
 assert.throws(()=>validateRestructuring([a],orphan,TODAY),/conserva/);
 assert.throws(()=>validateRestructuring([a],byService.map(t=>({...t,dueDate:"2026-12-01"})),TODAY),/passado/);
});

test("entre clientes diferentes ou títulos sem composição: recusado antes de qualquer efeito",()=>{
 const a=src(21,100_000,[[SVC_A,100_000]]);
 assert.throws(()=>planConsolidation([a,src(22,50_000,[[SVC_B,50_000]],OTHER)],{installments:1,firstDueDate:"2026-12-20"},"x",TODAY),/clientes diferentes/);
 assert.throws(()=>planConsolidation([a,src(22,50_000,[])],{installments:1,firstDueDate:"2026-12-20"},"x",TODAY),/não comprovada/);
 assert.throws(()=>planConsolidation([a,src(22,50_000,[[SVC_B,40_000]])],{installments:1,firstDueDate:"2026-12-20"},"x",TODAY),/não confere/);
 assert.throws(()=>planConsolidation([a,a],{installments:1,firstDueDate:"2026-12-20"},"x",TODAY),/repetida/);
 assert.throws(()=>planConsolidation([a,src(22,10,[[SVC_B,10]])],{installments:0,firstDueDate:"2026-12-20"},"x",TODAY),/parcelas/);
});

// ------------------------------------------------------------------ inadimplência por serviço e tolerância
const ob=(o:Partial<ServiceObligation>&{receivableId:string}):ServiceObligation=>({allocatedCents:60_000,dueDate:"2026-12-01",balanceCents:100_000,status:"open",excludedFromReports:false,...o});

test("duas compras: uma paga e outra em atraso → só o serviço da compra em atraso é restringido",()=>{
 const A=assessServiceObligations({serviceCents:60_000,obligations:[ob({receivableId:"a",dueDate:"2026-10-01",balanceCents:0,status:"paid"})],today:TODAY,graceDays:5});
 const C=assessServiceObligations({serviceCents:50_000,obligations:[ob({receivableId:"c",allocatedCents:50_000,dueDate:"2026-11-01"})],today:TODAY,graceDays:5});
 assert.equal(A.state,"authorized");assert.equal(C.state,"suspended");assert.equal(C.oldestDue,"2026-11-01");
});

test("mesma compra dividida: serviço pago segue liberado e o serviço em atraso é restringido; consolidada preserva a avaliação por serviço",()=>{
 // Compra A dividida por serviço: A1 paga, A2 em atraso.
 const paid=assessServiceObligations({serviceCents:60_000,obligations:[ob({receivableId:"x1",dueDate:"2026-11-01",balanceCents:0,status:"paid"})],today:TODAY,graceDays:0});
 const late=assessServiceObligations({serviceCents:40_000,obligations:[ob({receivableId:"x2",allocatedCents:40_000,dueDate:"2026-11-01"})],today:TODAY,graceDays:0});
 assert.deepEqual([paid.state,late.state],["authorized","suspended"]);
 // Obrigação unificada (um título para vários serviços): cada serviço avalia a SUA alocação; título pago libera todos.
 const unified=(balance:number,status:ServiceObligation["status"])=>[ob({receivableId:"u",allocatedCents:60_000,dueDate:"2026-11-01",balanceCents:balance,status})];
 assert.equal(assessServiceObligations({serviceCents:60_000,obligations:unified(100_000,"open"),today:TODAY,graceDays:0}).state,"suspended");
 assert.equal(assessServiceObligations({serviceCents:60_000,obligations:unified(0,"paid"),today:TODAY,graceDays:0}).state,"authorized","pagamento confirmado restaura");
 // Pagamento parcial NÃO é rateado: com saldo no título, todos os serviços nele alocados continuam em aberto.
 assert.equal(assessServiceObligations({serviceCents:60_000,obligations:unified(30_000,"partially_paid"),today:TODAY,graceDays:0}).state,"suspended");
});

test("parcela única cobrindo vários serviços: ambos seguem as alocações em aberto; parcelas futuras não suspendem",()=>{
 const obligations=(service:number)=>[
  ob({receivableId:"p1",allocatedCents:service/2,dueDate:"2026-11-10",balanceCents:0,status:"paid"}),
  ob({receivableId:"p2",allocatedCents:service/2,dueDate:"2026-12-05",balanceCents:50_000}),
  ob({receivableId:"p3",allocatedCents:0,dueDate:"2027-01-05",balanceCents:50_000})].slice(0,2);
 const a=assessServiceObligations({serviceCents:60_000,obligations:obligations(60_000),today:TODAY,graceDays:3});
 const b=assessServiceObligations({serviceCents:40_000,obligations:obligations(40_000),today:TODAY,graceDays:3});
 assert.deepEqual([a.state,a.oldestDue],["suspended","2026-12-05"]);assert.equal(b.state,"suspended");
 const future=assessServiceObligations({serviceCents:60_000,obligations:[ob({receivableId:"f",allocatedCents:60_000,dueDate:"2027-01-05"})],today:TODAY,graceDays:0});
 assert.equal(future.state,"authorized");
});

test("tolerâncias independentes e limites de dia (sem erro de um dia): vence D, tolerância N → suspende em D+N+1",()=>{
 const o=[ob({receivableId:"t",allocatedCents:10_000,dueDate:"2026-12-01"})];
 const at=(today:string,grace:number)=>assessServiceObligations({serviceCents:10_000,obligations:o,today,graceDays:grace}).state;
 assert.equal(at("2026-12-01",0),"authorized","no dia do vencimento ainda não está em atraso");
 assert.equal(at("2026-12-02",0),"suspended");
 assert.equal(at("2026-12-06",5),"grace","D+N ainda em tolerância");assert.equal(at("2026-12-07",5),"suspended","D+N+1 suspende");
 assert.equal(at("2026-12-31",30),"grace");assert.equal(at("2027-01-01",30),"suspended");
 assert.equal(at("2026-12-10",2),"suspended");assert.equal(at("2026-12-10",12),"grace","dois serviços, duas tolerâncias, avaliação independente");
 assert.equal(assessServiceObligations({serviceCents:10_000,obligations:o,today:TODAY,graceDays:31}).state,"review");
 assert.equal(assessServiceObligations({serviceCents:10_000,obligations:o,today:TODAY,graceDays:-1}).state,"review");
});

test("política efetiva: substituição individual ?? padrão global; herança explícita; sem nada, desativada",()=>{
 assert.equal(effectiveGraceDays(7,false,3),7,"substituição vence o padrão");
 assert.equal(effectiveGraceDays(0,true,3),0,"zero é uma substituição válida");
 assert.equal(effectiveGraceDays(null,true,3),3,"herda o padrão");
 assert.equal(effectiveGraceDays(null,true,null),null,"herdar sem padrão definido não presume tolerância");
 assert.equal(effectiveGraceDays(null,false,3),null,"sem herança explícita permanece desativada");
 assert.equal(effectiveGraceDays(undefined,false,undefined),null);
});

test("serviço sem valor não recebe dívida; título de teste, cancelado e soma incompleta nunca geram restrição às cegas",()=>{
 assert.equal(assessServiceObligations({serviceCents:0,obligations:[],today:TODAY,graceDays:0}).state,"authorized");
 const testRecord=assessServiceObligations({serviceCents:10_000,obligations:[ob({receivableId:"t",allocatedCents:10_000,dueDate:"2026-10-01",excludedFromReports:true})],today:TODAY,graceDays:0});
 assert.equal(testRecord.state,"authorized","título de teste preservado e ignorado");
 const replaced=assessServiceObligations({serviceCents:10_000,obligations:[
  ob({receivableId:"old",allocatedCents:10_000,dueDate:"2026-10-01",status:"cancelled"}),
  ob({receivableId:"new",allocatedCents:10_000,dueDate:"2026-12-20"})],today:TODAY,graceDays:0});
 assert.equal(replaced.state,"authorized","original substituído não conta; o substituto ainda não venceu");
 assert.equal(assessServiceObligations({serviceCents:10_000,obligations:[ob({receivableId:"p",allocatedCents:4_000})],today:TODAY,graceDays:0}).state,"review","alocação incompleta exige revisão");
 assert.equal(assessServiceObligations({serviceCents:10_000,obligations:[],today:TODAY,graceDays:0}).state,"review");
});

// ------------------------------------------------------------------ orquestração (fakes): cobrança externa, concorrência, replay
const srcRow=(id:number,cents:number,allocs:Array<[string,number]>):SourceRow=>({...src(id,cents,allocs),reference:`REC-${id}`,dueDate:"2026-12-01",purchaseLabel:`Compra IR-COM-${id}`,serviceTitles:{[SVC_A]:"LED",[SVC_B]:"Jornal",[SVC_C]:"Outro LED"}});
const cmd=(over:Partial<RestructureCommand>={}):RestructureCommand=>({operationId:uuid(500),kind:"consolidate",sourceIds:[uuid(21),uuid(22)],terms:{installments:2,firstDueDate:"2026-12-20",intervalMonths:1},description:"Unificação",reason:"Pedido do cliente em reunião",preview:false,...over});
function fakeDeps(over:Partial<RestructureDeps>={},sources:SourceRow[]=[srcRow(21,100_000,[[SVC_A,60_000],[SVC_B,40_000]]),srcRow(22,50_000,[[SVC_C,50_000]])]){
 const log:string[]=[];const replaced=new Set<string>();let ops=new Map<string,string>();
 const deps:RestructureDeps={
  today:TODAY,
  loadSources:async ids=>{log.push("load");return ids.every(id=>sources.some(s=>s.id===id))?{ok:true,sources:sources.filter(s=>ids.includes(s.id))}:{ok:false,error:"Alguma cobrança selecionada não foi encontrada."};},
  charges:{inspect:async()=>{log.push("inspect");return "cancellable" as const;},supersede:async id=>{log.push("supersede:"+id);return {kind:"cancelled" as const};}},
  restructure:async args=>{
   log.push("restructure");
   const known=ops.get(args.operationId);
   if(known)return {ok:true,restructuringId:known,targetIds:["t1","t2"],replayed:true};
   if(args.sources.some(s=>replaced.has(s)))return {ok:false,error:"Título já foi substituído por outra reestruturação."};
   args.sources.forEach(s=>replaced.add(s));ops.set(args.operationId,"rst-"+ops.size);
   return {ok:true,restructuringId:ops.get(args.operationId)!,targetIds:["t1","t2"],replayed:false};
  },
  reassess:async ids=>{log.push("reassess:"+ids.length);},
  audit:async e=>{log.push("audit:"+e.action);},
  ...over,
 };
 return {deps,log};
}

test("cliente não tem como reestruturar: comando estrito, confirmação obrigatória e nenhuma rota do portal",()=>{
 const base={operationId:uuid(500),kind:"consolidate",sourceIds:[uuid(21),uuid(22)],installments:2,firstDueDate:"2026-12-20",description:"x",reason:"Motivo suficiente"};
 assert.equal(parseRestructureCommand({...base}),null,"aplicar sem confirmed é recusado");
 assert.ok(parseRestructureCommand({...base,confirmed:true}));
 assert.ok(parseRestructureCommand({...base,preview:true}),"prévia não exige confirmação");
 for(const bad of [{amount:1},{targets:[]},{allocations:[]},{clientId:OTHER},{status:"paid"}])assert.equal(parseRestructureCommand({...base,confirmed:true,...bad}),null,JSON.stringify(bad));
 assert.equal(parseRestructureCommand({...base,confirmed:true,sourceIds:[uuid(21),uuid(21)]}),null);
 assert.equal(parseRestructureCommand({...base,confirmed:true,reason:"curto"}),null);
 assert.equal(parseRestructureCommand({...base,confirmed:true,kind:"split"}),null,"dividir exige o modo");
 assert.ok(parseRestructureCommand({...base,confirmed:true,kind:"split",splitMode:"by_service"}));
 // O portal (Informativo/pagamento) não importa nem referencia a reestruturação.
 for(const f of ["../src/app/api/integrations/altnix/finance-payment/route.ts","../src/lib/integrations/altnixFinancePayment.ts","../src/lib/integrations/financePaymentRuntime.ts","../src/app/api/public/pagamento/[token]/metodo/route.ts","../src/app/pagamento/[token]/page.tsx"])
  assert.doesNotMatch(readApp(f),/restructure|Unificar cobranças|Dividir cobrança/i,f);
});

test("prévia não tem efeitos; aplicar: inspeção local → cancelamento com prova → RPC → auditoria → reavaliação event-driven",async()=>{
 const p=fakeDeps();
 const preview=await runRestructuring(cmd({preview:true}),p.deps);
 assert.ok(preview.ok&&!preview.applied);assert.deepEqual(p.log,["load"]);
 if(preview.ok){assert.equal(preview.preview.totalCents,150_000);assert.deepEqual(preview.preview.targets.map(t=>t.totalCents).reduce((a,b)=>a+b,0),150_000);}
 const f=fakeDeps();
 const result=await runRestructuring(cmd(),f.deps);
 assert.ok(result.ok&&result.applied);
 assert.deepEqual(f.log,["load","inspect","inspect","supersede:"+uuid(21),"supersede:"+uuid(22),"restructure","audit:consolidate","reassess:4"]);
});

test("cobrança externa que não pode ser cancelada com prova: reestruturação recusada, nada criado, arranjo preservado",async()=>{
 for(const reason of ["cancellation_unproven","ambiguous_reservation","paid_or_confirmed","local_state_changed"]){
  const f=fakeDeps({charges:{inspect:async()=>"cancellable",supersede:async()=>({kind:"blocked",reason})}});
  const result=await runRestructuring(cmd(),f.deps);
  assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,"charge_blocked");
  assert.ok(!f.log.includes("restructure"),"nenhuma nova obrigação: "+reason);assert.ok(!f.log.some(l=>l.startsWith("reassess")));
 }
 // Timeout/erro no provedor também é recusa segura.
 const timeout=fakeDeps({charges:{inspect:async()=>"cancellable",supersede:async()=>{throw new Error("timeout");}}});
 const r=await runRestructuring(cmd(),timeout.deps);assert.equal(r.ok,false);assert.ok(!timeout.log.includes("restructure"));
 // Pagamento já confirmado/ambíguo é detectado ANTES de cancelar qualquer cobrança.
 const early=fakeDeps({charges:{inspect:async id=>id===uuid(22)?"paid_or_confirmed":"cancellable",supersede:async id=>{early.log.push("supersede:"+id);return {kind:"cancelled"};}}});
 const e=await runRestructuring(cmd(),early.deps);assert.equal(e.ok,false);
 assert.ok(!early.log.some(l=>l.startsWith("supersede")),"nada cancelado quando há pagamento em andamento");
});

test("restruturações concorrentes e repetidas: sem obrigação duplicada; mesma operação é idempotente",async()=>{
 const f=fakeDeps();
 const [first,second]=await Promise.all([runRestructuring(cmd(),f.deps),runRestructuring(cmd({operationId:uuid(501)}),f.deps)]);
 const outcomes=[first,second];
 assert.equal(outcomes.filter(o=>o.ok&&o.applied).length,1,"apenas uma aplicação vence");
 const lost=outcomes.find(o=>!o.ok);assert.ok(lost&&!lost.ok&&lost.code==="rejected");
 const replay=await runRestructuring(cmd(),f.deps);
 assert.ok(replay.ok&&replay.applied&&replay.replayed,"repetição exata devolve o resultado sem duplicar");
});

test("fontes inelegíveis (outro cliente, teste, com histórico) e erros de leitura: recusados sem tocar o provedor",async()=>{
 const f=fakeDeps({loadSources:async()=>({ok:false,error:"Há recebimento ou abatimento em uma das cobranças. Concilie o histórico antes de reestruturar."})});
 const r=await runRestructuring(cmd(),f.deps);assert.ok(!r.ok&&r.code==="ineligible");assert.deepEqual(f.log,[]);
 const down=fakeDeps({loadSources:async()=>{throw new Error("db");}});
 const d=await runRestructuring(cmd(),down.deps);assert.ok(!d.ok&&d.code==="unavailable");
 const mixed=fakeDeps({},[srcRow(21,100_000,[[SVC_A,100_000]]),{...srcRow(22,50_000,[[SVC_C,50_000]]),clientId:OTHER}]);
 const m=await runRestructuring(cmd(),mixed.deps);assert.ok(!m.ok&&m.code==="invalid");assert.ok(!mixed.log.includes("inspect"));
 const lateDue=fakeDeps();
 const past=await runRestructuring(cmd({terms:{installments:1,firstDueDate:"2026-12-01"}}),lateDue.deps);assert.ok(!past.ok&&past.code==="invalid");
});

// ------------------------------------------------------------------ PaymentChargeService.supersedeActiveCharge (serviço REAL, repositório/gateway simulados)
const REC=uuid(3);
const charge=(over:Partial<PaymentCharge>):PaymentCharge=>({
 id:"c1",receivableId:REC,clientId:CLIENT,provider:"asaas",providerChargeId:"pay_1",amount:600,status:"pending",pixCopyPaste:"PIX",publicToken:"tok",paymentMethod:"pix",
 expiresAt:"2026-12-20T02:59:59Z",createdAt:"2026-12-05T00:00:00Z",updatedAt:"2026-12-05T00:00:00Z",...over} as PaymentCharge);
function backend(initial:PaymentCharge[],gw:{cancel?:"ok"|"fail";remote?:"paid"|"cancelled"|"pending"|"throw";confirmed?:boolean;updateFails?:boolean}={}){
 const rows=[...initial];const cancels:string[]=[];
 const repo={
  listForReceivable:async()=>[...rows].reverse(),findPendingForReceivable:async()=>rows.find(c=>c.status==="pending")??null,getById:async(id:string)=>rows.find(c=>c.id===id)??null,
  create:async()=>{throw new PaymentChargeAlreadyPendingError();},
  update:async(id:string,changes:Partial<PaymentCharge>)=>{if(gw.updateFails)throw new Error("db");const r=rows.find(c=>c.id===id)!;Object.assign(r,changes);return r;},
 } as unknown as PaymentChargeRepository;
 const provider:PixProvider={
  async createCharge(){throw new Error("não deve criar");},
  async getCharge(id){if(gw.remote==="throw")throw new Error("down");return {provider:"asaas",providerChargeId:id,pixCopyPaste:"",status:gw.remote??"cancelled",confirmed:gw.confirmed};},
  async cancelCharge(id){cancels.push(id);if(gw.cancel==="fail")throw new Error("timeout");},
 };
 return {rows,cancels,service:new PaymentChargeService(repo,provider,true)};
}

test("cancelamento seguro de cobrança externa para reestruturar: PIX e cartão, com prova; pago/confirmado/ambíguo bloqueiam",async()=>{
 const ok=backend([charge({})]);
 assert.equal(await ok.service.inspectChargeForRestructuring(REC),"cancellable");
 assert.deepEqual(await ok.service.supersedeActiveCharge(REC,{reason:"reestruturacao_administrativa",cancelledByProfileId:uuid(7)}),{kind:"cancelled"});
 assert.deepEqual(ok.cancels,["pay_1"]);assert.equal(ok.rows[0].status,"cancelled");assert.equal(ok.rows[0].cancellationReason,"reestruturacao_administrativa");
 assert.equal(ok.rows[0].providerChargeId,"pay_1","referência Asaas preservada");
 const card=backend([charge({paymentMethod:"credit_card",invoiceUrl:"https://www.asaas.com/i/abc12345",pixCopyPaste:undefined,installmentCount:3})]);
 assert.deepEqual(await card.service.supersedeActiveCharge(REC,{reason:"r"}),{kind:"cancelled"});
 assert.deepEqual(await backend([]).service.supersedeActiveCharge(REC,{reason:"r"}),{kind:"none"});
 assert.deepEqual(await backend([charge({status:"cancelled"})]).service.supersedeActiveCharge(REC,{reason:"r"}),{kind:"none"});
 // Expirada localmente, mas possivelmente pagável no provedor: também é cancelada com prova.
 const expired=backend([charge({status:"expired"})]);
 assert.deepEqual(await expired.service.supersedeActiveCharge(REC,{reason:"r"}),{kind:"cancelled"});assert.deepEqual(expired.cancels,["pay_1"]);
 // Pago, confirmado pelo provedor ou reserva ambígua: nunca substituído.
 assert.deepEqual(await backend([charge({status:"paid",paidAt:"2026-12-07T10:00:00Z"})]).service.supersedeActiveCharge(REC,{reason:"r"}),{kind:"blocked",reason:"paid_or_confirmed"});
 const confirmed=backend([charge({paymentMethod:"credit_card",providerConfirmedAt:"2026-12-07T10:00:00Z"})]);
 assert.deepEqual(await confirmed.service.supersedeActiveCharge(REC,{reason:"r"}),{kind:"blocked",reason:"paid_or_confirmed"});assert.deepEqual(confirmed.cancels,[],"cartão confirmado nunca é cancelado");
 const ambiguous=backend([charge({providerChargeId:undefined})]);
 assert.deepEqual(await ambiguous.service.supersedeActiveCharge(REC,{reason:"r"}),{kind:"blocked",reason:"ambiguous_reservation"});assert.equal(await ambiguous.service.inspectChargeForRestructuring(REC),"ambiguous_reservation");
});

test("cancelamento com timeout/ambiguidade: só 'cancelada' no provedor libera; recebida, pendente ou sem resposta bloqueiam; pagamento tardio preservado",async()=>{
 const cases:Array<[Parameters<typeof backend>[1],string]>=[
  [{cancel:"fail",remote:"paid"},"paid_or_confirmed"],[{cancel:"fail",remote:"pending",confirmed:true},"paid_or_confirmed"],
  [{cancel:"fail",remote:"pending"},"cancellation_unproven"],[{cancel:"fail",remote:"throw"},"cancellation_unproven"],
 ];
 for(const [gw,reason] of cases){
  const b=backend([charge({})],gw);
  assert.deepEqual(await b.service.supersedeActiveCharge(REC,{reason:"r"}),{kind:"blocked",reason});
  assert.equal(b.rows[0].status,"pending","registro local preservado sem prova de cancelamento");
 }
 // Timeout, mas o provedor confirma que cancelou → segue.
 const proven=backend([charge({})],{cancel:"fail",remote:"cancelled"});
 assert.deepEqual(await proven.service.supersedeActiveCharge(REC,{reason:"r"}),{kind:"cancelled"});
 // Falha ao gravar localmente e o estado real mudou para pago → bloqueia; permanece pendente → bloqueia.
 const race=backend([charge({})],{updateFails:true});
 assert.deepEqual(await race.service.supersedeActiveCharge(REC,{reason:"r"}),{kind:"blocked",reason:"local_state_changed"});
});

// ------------------------------------------------------------------ banco (migration), ações e escopo
test("migration: aditiva; composição imutável e verificada no commit; reestruturação atômica, conservadora e com linhagem",()=>{
 const sql=readRoot("supabase/migrations/20261127200000_purchase_billing_allocation_restructuring.sql");
 assert.doesNotMatch(sql,/\bdrop\s+(table|column|index|function)\b|\bdelete\s+from\b|\btruncate\s+table\b/i,"nada destrutivo");
 assert.match(sql,/allocated_cents bigint not null check \(allocated_cents > 0\)/,"centavos inteiros, nunca dívida zero");
 assert.match(sql,/create constraint trigger receivable_service_allocations_total[\s\S]*deferrable initially deferred/);
 assert.match(sql,/revoke update, delete, truncate on public\.receivable_service_allocations from service_role/,"alocação imutável");
 assert.match(sql,/create unique index receivable_restructuring_one_source[\s\S]*where role = 'source'/,"título substituído uma única vez");
 assert.match(sql,/alter table public\.receivables add column if not exists restructuring_id/);
 // Alocação determinística (maior resto, desempate por item) e só com composição provada.
 assert.match(sql,/row_number\(\) over \(order by c\.frac desc, c\.item_ordinal\)/);
 assert.match(sql,/if v_sum <> round\(sale\.amount \* 100\)::bigint then return -1/);
 assert.match(sql,/where w\.cents > 0/,"serviço sem valor não recebe alocação");
 // Reestruturação: tudo sob lock, mesmo cliente, só pristino, sem cobrança ativa, conservação por serviço, linhagem.
 const fn=sql.slice(sql.indexOf("create function public.restructure_receivables"));
 for(const needle of [
  "pg_advisory_xact_lock","for update","Cobranças de clientes diferentes","v_src.status <> 'open'","report_excluded_at is not null",
  "receivable_receipts","receivable_adjustments","c.status in ('pending', 'paid')","A divisão não conserva o valor por serviço",
  "v_due < v_today","receivable_restructuring_links","status = 'cancelled'",
 ])assert.ok(fn.includes(needle),needle);
 assert.match(fn,/Identificador de operação já usado com outros dados/,"idempotência por operação");
 assert.match(sql,/revoke all on function public\.restructure_receivables[\s\S]*grant execute on function public\.restructure_receivables[^;]*to service_role/);
 assert.doesNotMatch(fn,/delete from|update public\.receivable_receipts|update public\.payment_charges|insert into public\.payment_charges/i,"não toca recibos nem cria/apaga cobranças");
});

test("migration: avaliação por serviço via alocação; tolerância global/individual/herança; processador existente reaproveitado",()=>{
 const sql=readRoot("supabase/migrations/20261127200000_purchase_billing_allocation_restructuring.sql");
 const assess=sql.slice(sql.indexOf("create or replace function public.altnix_assess_service_finance"),sql.indexOf("-- 6)"));
 assert.match(assess,/from public\.receivable_service_allocations a/);
 assert.match(assess,/America\/Sao_Paulo/);
 assert.match(assess,/if item_cents = 0 then return jsonb_build_object\('state', 'authorized'/,"serviço sem valor");
 assert.match(assess,/t\.report_excluded_at is null/,"título de teste não gera restrição");
 assert.match(assess,/civil_day <= oldest \+ p_grace_days/,"limite de tolerância");
 assert.doesNotMatch(assess,/service_count/,"regra de serviço único removida");
 assert.match(sql,/when b\.financial_grace_days is not null then b\.financial_grace_days[\s\S]*when b\.financial_inherit_default then/,"individual ?? padrão");
 assert.match(sql,/check \(default_grace_days between 0 and 30\)/);assert.match(sql,/p_days not between 0 and 30/);
 assert.match(sql,/create or replace function public\.altnix_apply_service_finance[\s\S]*altnix_effective_grace[\s\S]*altnix_allocate_sale_receivables/);
 assert.match(sql,/decision_origin = 'manual' and desired <> 'ended' then return 'manual_required'/,"suspensão manual nunca é desfeita por pagamento");
 assert.match(sql,/altnix_queue_service_authorization\(p_service, gen_random_uuid\(\)/,"mesma fila/outbox");
 assert.match(sql,/receivable_service_allocations a on a\.service_id = b\.service_id[\s\S]*where b\.enabled and a\.receivable_id = any\(p_receivable_ids\)/,"reavaliação só dos serviços ligados aos títulos");
 assert.doesNotMatch(sql,/pg_cron|cron\.schedule|create trigger[^;]*heartbeat/i,"sem novo agendamento nem avaliação no heartbeat");
 // A rotina diária existente continua sendo a única varredura (não redefinida aqui).
 assert.doesNotMatch(sql,/altnix_run_daily_service_finance/);
});

test("ações administrativas: permissões financeiras granulares, ativação desligada por padrão e consultas em lote",()=>{
 const actions=readApp("../src/app/sistema/financeiro/contas-a-receber/restructure-actions.ts");
 assert.match(actions,/\["titulos_criar", "titulos_cancelar"\]/);
 assert.match(actions,/JORNALIR_RESTRUCTURING_ENABLED !== "true"/);
 assert.ok(actions.indexOf("parseRestructureCommand(raw)")<actions.indexOf("checkFinanceAction(permission)"));
 assert.match(actions,/profile\?\.role !== "owner"|profile.role !== "owner"/,"tolerância global reservada ao proprietário");
 const runtime=readApp("../src/lib/financeiro/receivableRestructuringRuntime.ts");
 assert.match(runtime,/getPaymentChargeService\(admin\)/,"reaproveita o PaymentChargeService");
 assert.match(runtime,/notifyAltnixReceivableCommit/,"reaproveita a reavaliação event-driven");
 assert.match(runtime,/recordAuditEventSupabase/,"auditoria existente");
 assert.doesNotMatch(runtime,/setInterval|setTimeout|cron/i);
 assert.doesNotMatch(runtime+actions,/api\.asaas|asaasFetch|fetch\(/,"nenhuma chamada direta ao Asaas");
 const op=readApp("../src/app/sistema/publicidade/vendas/[id]/operational-authorization-actions.ts");
 assert.match(op,/altnix_configure_service_finance_mode/);assert.match(op,/mode==="override"&&\(days===null/);
 // Reaproveitamento de relatórios: só abertos entram; originais cancelados não duplicam valores.
 assert.match(readApp("../src/providers/supabase/financialOverview.supabase.ts"),/\.in\("status", \["open", "partially_paid"\]\)/);
 // Exclusão de registros de teste preservada nas leituras de composição que alimentam o portal.
 const preview=readApp("../src/app/api/integrations/altnix/finance-preview/route.ts");
 assert.match(preview,/withoutExcludedReceivables/);assert.match(preview,/receivable_service_allocations/);
 assert.doesNotMatch(preview,/valor|cents|allocated_cents/,"preview do portal não expõe valores por serviço");
});

test("gerar financeiro aloca por serviço sem afetar a geração; contrato permanente e módulos alheios intocados",()=>{
 const gen=readApp("../src/app/sistema/publicidade/vendas/[id]/actions.ts");
 assert.match(gen,/altnix_allocate_sale_receivables/);
 for(const f of ["../src/lib/financeiro/receivableRestructuring.ts","../src/lib/financeiro/receivableRestructuringRuntime.ts","../src/app/sistema/financeiro/contas-a-receber/restructure-actions.ts","../src/providers/supabase/saleBillingComposition.supabase.ts","../src/features/financeiro/PurchaseBillingPanel.tsx"]){
  assert.doesNotMatch(readApp(f),/ad_contracts|internal_permanent|NovaStar|novastar|playlist|media_assets|heartbeat|android/i,f);
 }
 const core=readRoot("packages/core/src/financeiro/receivable-restructuring.ts");
 assert.doesNotMatch(core,/Math\.round\([^)]*\*\s*100\)|parseFloat|toFixed/,"sem aritmética de ponto flutuante");
});

test("situação financeira da compra após reestruturação: substitutos representam a compra, originais cancelados não contam; sem consulta extra quando nada foi cancelado",async()=>{
 const {loadRestructuredSummariesBySale}=await import("../src/providers/supabase/saleBillingComposition.supabase");
 const calls:string[]=[];
 const fake=(tables:Record<string,unknown[]>)=>({from:(table:string)=>{calls.push(table);const rows=tables[table]??[];const builder:Record<string,unknown>={};
  for(const m of ["select","eq","in"])builder[m]=()=>builder;
  (builder as {then:unknown}).then=(resolve:(v:{data:unknown[];error:null})=>void)=>resolve({data:rows,error:null});return builder;}}) as never;
 const SALE1="s1",SALE2="s2";
 const receivables=[{id:"o1",status:"cancelled",commercialSaleId:SALE1},{id:"o2",status:"cancelled",commercialSaleId:SALE2},{id:"x",status:"paid",commercialSaleId:SALE1}];
 const tables={receivable_restructuring_links:[{restructuring_id:"r1",receivable_id:"o1"},{restructuring_id:"r1",receivable_id:"o2"}],
  receivables:[{id:"t1",status:"open",due_date:"2027-01-10",restructuring_id:"r1"}]};
 const map=await loadRestructuredSummariesBySale(fake(tables),receivables);
 assert.deepEqual(map.get(SALE1),[{status:"open",dueDate:"2027-01-10"}]);assert.deepEqual(map.get(SALE2),[{status:"open",dueDate:"2027-01-10"}],"consolidada representa as duas compras");
 calls.length=0;
 assert.equal((await loadRestructuredSummariesBySale(fake(tables),[{id:"x",status:"paid",commercialSaleId:SALE1}])).size,0);
 assert.deepEqual(calls,[],"nenhuma consulta quando não há título cancelado");
 const before=await loadRestructuredSummariesBySale(fake({}),receivables);assert.equal(before.size,0,"antes da migration/sem vínculo: comportamento anterior");
 for(const f of ["../src/app/sistema/publicidade/vendas/page.tsx","../src/app/sistema/publicidade/vendas/imprimir/page.tsx"])assert.match(readApp(f),/loadRestructuredSummariesBySale\(supabase, receivables\)/,f);
});
