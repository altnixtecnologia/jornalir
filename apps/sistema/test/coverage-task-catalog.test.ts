import test from "node:test";
import assert from "node:assert/strict";
import {FIXED_COVERAGE_TASKS,validateCoverageTasks} from "../src/features/agenda/coverageTaskCatalog";

test("catálogo editorial possui funções padrão distintas",()=>{
 assert.equal(FIXED_COVERAGE_TASKS.length,4);
 assert.equal(new Set(FIXED_COVERAGE_TASKS.map(t=>t.kind)).size,4);
});
test("uma pessoa pode assumir entregas independentes e personalizadas",()=>{
 const tasks=validateCoverageTasks([
  {kind:"media",label:"Fotos e vídeos"},
  {kind:"interviews",label:"Entrevistas"},
  {kind:"custom",label:"  Revisão de legendas  "},
 ]);
 assert.deepEqual(tasks,[
  {kind:"media",label:"Fotos e vídeos"},
  {kind:"interviews",label:"Entrevistas"},
  {kind:"custom",label:"Revisão de legendas"},
 ]);
});
test("rejeita tarefa repetida e nome customizado duplicado",()=>{
 assert.equal(validateCoverageTasks([
  {kind:"custom",label:"Fotos extras"},
  {kind:"custom",label:" fotos extras "},
 ]),null);
});
test("impede alteração dos nomes oficiais e tarefa sem conteúdo",()=>{
 assert.equal(validateCoverageTasks([{kind:"media",label:"Foto"}]),null);
 assert.equal(validateCoverageTasks([{kind:"custom",label:" "}]),null);
 assert.equal(validateCoverageTasks([]),null);
});
test("aceita até oito entregas, mas não nove",()=>{
 const eight=Array.from({length:8},(_,i)=>({kind:"custom",label:"Etapa especial "+i}));
 assert.equal(validateCoverageTasks(eight)?.length,8);
 assert.equal(validateCoverageTasks([...eight,{kind:"media",label:"Fotos e vídeos"}]),null);
});
