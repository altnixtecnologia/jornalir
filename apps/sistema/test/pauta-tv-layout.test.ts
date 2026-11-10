import test from "node:test";
import assert from "node:assert/strict";
import {calculateTvPagination} from "../src/features/pauta-tv/tvModel";

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
