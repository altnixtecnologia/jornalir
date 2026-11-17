import test from "node:test";
import assert from "node:assert/strict";
import type { AgendaEventItem } from "../src/features/agenda/agendaTypes";
import { agendaEventState, agendaDayCounts, agendaMonthCounts } from "../src/features/agenda/agendaCalendarStatus";

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
