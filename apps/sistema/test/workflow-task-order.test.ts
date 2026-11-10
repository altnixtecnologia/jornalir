import test from "node:test";
import assert from "node:assert/strict";
import {reorderTaskItems} from "../src/features/agenda/workflowTaskOrder";

test("arrastar muda a posição e preserva cada função",()=>{
 const original=[
  {kind:"media",label:"Fotos e vídeos"},
  {kind:"interviews",label:"Entrevistas"},
  {kind:"live",label:"Transmissão"},
 ];
 const ordered=reorderTaskItems(original,0,2);
 assert.deepEqual(ordered.map(x=>x.label),["Entrevistas","Transmissão","Fotos e vídeos"]);
 assert.deepEqual(original.map(x=>x.label),["Fotos e vídeos","Entrevistas","Transmissão"]);
 assert.equal(ordered[2],original[0]);
});
test("arrastar para cima mantém o colaborador original",()=>{
 const items=[{label:"A",owner:"x"},{label:"B",owner:"x"},{label:"C",owner:"x"}];
 const ordered=reorderTaskItems(items,2,0);
 assert.deepEqual(ordered.map(x=>x.label),["C","A","B"]);
 assert.ok(ordered.every(item=>item.owner==="x"));
});
test("soltar fora de uma posição válida não altera nada",()=>{
 const items=["A","B","C"];
 assert.deepEqual(reorderTaskItems(items,0,-1),items);
 assert.deepEqual(reorderTaskItems(items,2,9),items);
 assert.deepEqual(reorderTaskItems(items,1,1),items);
 assert.deepEqual(reorderTaskItems(items,NaN,0),items);
});
