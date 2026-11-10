import test from "node:test";
import assert from "node:assert/strict";
import {calculateTvPagination,getTvResponsibleNames,tvPautaMinRowPx} from "../src/features/pauta-tv/tvModel";
import type {WeeklyPautaItem} from "../src/features/agenda/agendaTypes";

test("TV: quatro e seis cards usam toda a altura disponível",()=>{
 const four=calculateTvPagination(820,4);
 const six=calculateTvPagination(820,6);
 assert.equal(four.perPage,4);
 assert.equal(six.perPage,6);
 assert.equal(four.pages,1);
 assert.equal(six.pages,1);
 assert.ok(four.rowPx>six.rowPx);
});
test("TV: muitas pautas paginam sem fonte ilegível nem rolagem",()=>{
 const lots=calculateTvPagination(820,24);
 assert.ok(lots.perPage>=8 && lots.perPage<24);
 assert.ok(lots.pages>1);
 assert.ok(lots.rowPx>=70);
});
test("TV: sem matérias, exibe estado vazio",()=>{
 assert.deepEqual(calculateTvPagination(820,0),{perPage:0,pages:1,rowPx:0});
});

test("TV: linha compacta permite mais pautas simultâneas",()=>{
 assert.ok(calculateTvPagination(820,20).perPage>calculateTvPagination(820,20,82).perPage);
});


test("TV: todos os responsáveis aparecem, sem duplicar o titular",()=>{
 const staff=[
  {id:"11111111-1111-4111-8111-111111111111",name:"Ana Souza",role:"operator",completedAt:null,taskLabel:null},
  {id:"22222222-2222-4222-8222-222222222222",name:"Bruno Lima",role:"operator",completedAt:null,taskLabel:null},
  {id:"33333333-3333-4333-8333-333333333333",name:"Carlos Silva",role:"operator",completedAt:null,taskLabel:null},
 ];
 const item:WeeklyPautaItem={
  id:"pauta",weekStart:"2026-11-05",title:"Reportagem coletiva",
  description:null,dueDate:null,dueTime:null,
  responsibleProfileId:staff[0].id,responsibleName:staff[0].name,
  agendaEventId:null,agendaEventTitle:null,coverage:null,workflow:null,articleId:null,
  status:"pending",completedAt:null,assignees:staff,updatedAt:"2026-11-10T14:00:00Z",
 };
 const names=new Map(staff.map(person=>[person.id,person.name]));
 assert.equal(getTvResponsibleNames(item,names),"Ana Souza · Bruno Lima · Carlos Silva");
 item.assignees=[staff[0]];
 assert.equal(getTvResponsibleNames(item,names),"Ana Souza");
});
test("TV: nomes longos aumentam a altura mínima antes de paginar",()=>{
 const card={id:"1",title:"Reportagem",responsible:"Ana Souza",
  detail:"",status:"pending" as const,date:null};
 const small=tvPautaMinRowPx([card],500);
 const large=tvPautaMinRowPx([{...card,responsible:Array(12).fill("Responsável").join(" · ")}],500);
 assert.ok(large>small);
 assert.ok(calculateTvPagination(780,20,large).perPage<
   calculateTvPagination(780,20,small).perPage);
});
