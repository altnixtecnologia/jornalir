import test from "node:test";
import assert from "node:assert/strict";
import type { AgendaEventItem } from "../src/features/agenda/agendaTypes";
import { agendaEventState, agendaDayCounts, agendaMonthCounts, pautaStatusFromLinkedAgenda } from "../src/features/agenda/agendaCalendarStatus";
import { readFileSync } from "node:fs";

function event(status:AgendaEventItem["status"], other:Partial<AgendaEventItem>={}):AgendaEventItem {
  return {
    id:"test",title:"Compromisso",eventDate:"2026-11-09",status,
    completedAt:status==="completed"?"2026-11-10T13:00:00Z":null,
    workflowClosedAt:status==="completed"?"2026-11-10T13:00:00Z":null,
    showInAgenda:true, ...other,
  } as AgendaEventItem;
}

test("duas sessões encerradas não contam como dois compromissos em aberto",()=>{
 const a=event("completed",{title:"Câmara de São João do Sul",assignees:[]});
 const b=event("completed",{title:"Câmara de Passo de Torres",assignees:[]});
 assert.deepEqual(agendaDayCounts([a,b]),{open:0,completed:2});
 assert.deepEqual(agendaMonthCounts([a,b],"2026-11-01","2026-11-30"),{open:0,completed:2});
});
test("marcadores de conclusão vencem status residual agendado",()=>{
 assert.equal(agendaEventState(event("scheduled",{workflowClosedAt:"2026-11-10T12:00:00Z"})),"completed");
 assert.equal(agendaEventState(event("scheduled",{completedAt:"2026-11-10T12:00:00Z"})),"completed");
});
test("cancelado permanece cancelado e não entra nos indicadores",()=>{
 assert.equal(agendaEventState(event("cancelled",{completedAt:"2026-11-10T12:00:00Z"})),"cancelled");
 assert.deepEqual(agendaDayCounts([event("cancelled")]),{open:0,completed:0});
});
test("apenas compromissos da Agenda entram; não misturar Só Matéria da Pauta",()=>{
 const pending=event("scheduled");
 const pautaOnly=event("scheduled",{showInAgenda:false});
 const done=event("completed");
 assert.deepEqual(agendaDayCounts([pending,pautaOnly,done]),{open:1,completed:1});
 assert.deepEqual(agendaMonthCounts([pending],"2026-12-01","2026-12-31"),{open:0,completed:0});
});

test("cores do compromisso seguem situação e não cor do responsável", async () => {
 const { agendaEventStatusColor } = await import("../src/features/agenda/agendaCalendarStatus");
 assert.equal(agendaEventStatusColor(event("completed",{title:"Câmara Passo de Torres"}),true),"#16A34A");
 assert.equal(agendaEventStatusColor(event("completed",{title:"Câmara São João do Sul"}),false),"#16A34A");
 assert.equal(agendaEventStatusColor(event("scheduled"),true),"#C8102E");
 assert.equal(agendaEventStatusColor(event("scheduled"),false),"#F5B51B");
 assert.equal(agendaEventStatusColor(event("cancelled"),true),"#94A3B8");
});


test("Pauta comum e de equipe respeitam encerramento final do evento vinculado",()=>{
 const concludedWithIndividualPending=event("scheduled",{
   workflowClosedAt:"2026-11-10T13:00:00Z",
   completedAt:null,
   coverage:{teamMode:true} as AgendaEventItem["coverage"],
 });
 assert.equal(pautaStatusFromLinkedAgenda("pending",concludedWithIndividualPending),"completed");
 assert.equal(pautaStatusFromLinkedAgenda("pending",event("completed")),"completed");
 assert.equal(pautaStatusFromLinkedAgenda("pending",event("scheduled",{completedAt:"2026-11-11T12:00:00Z"})),"completed");
 assert.equal(pautaStatusFromLinkedAgenda("cancelled",concludedWithIndividualPending),"cancelled");
});

test("baixas individuais e agendamentos de equipe continuam independentes",()=>{
 const scheduledTeam=event("scheduled",{
   completedAt:null,workflowClosedAt:null,
   coverage:{teamMode:true} as AgendaEventItem["coverage"],
 });
 assert.equal(pautaStatusFromLinkedAgenda("pending",scheduledTeam),"pending");
 assert.equal(pautaStatusFromLinkedAgenda("completed",scheduledTeam),"completed");
 assert.equal(pautaStatusFromLinkedAgenda("pending",event("scheduled")),"pending");
 assert.equal(pautaStatusFromLinkedAgenda("completed",event("scheduled")),"pending");
 assert.equal(pautaStatusFromLinkedAgenda("completed",null),"completed");
 assert.equal(pautaStatusFromLinkedAgenda("pending",event("cancelled")),"cancelled");
});

test("servidor não mostra convite encerrado nem status residual aberto na Pauta",()=>{
 const source=readFileSync(new URL("../src/features/agenda/agendaData.ts",import.meta.url),"utf8");
 assert.match(source,/\.is\("completed_at", null\)\.is\("workflow_closed_at", null\)/);
 assert.match(source,/status: agendaEventState\(\{/);
 assert.match(source,/status: pautaStatusFromLinkedAgenda\(item\.status/);
 assert.match(source,/linked\.completedAt \?\? linked\.workflowClosedAt \?\? item\.completed_at/);
});
