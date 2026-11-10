import test from "node:test";
import assert from "node:assert/strict";
import {movePautaCardIds} from "../src/features/agenda/pautaCardOrdering";
test("arrastar o cartão inteiro altera a posição, sem perder IDs",()=>{
 const current=["a","b","c","d"];
 assert.deepEqual(movePautaCardIds(current,"a","c"),["b","c","a","d"]);
 assert.deepEqual(movePautaCardIds(current,"d","b"),["a","d","b","c"]);
 assert.deepEqual(current,["a","b","c","d"]);
});
test("não mover sem alvo válido, nem duplicar cartão",()=>{
 const current=["a","b","c"];
 assert.equal(movePautaCardIds(current,"a","a"),null);
 assert.equal(movePautaCardIds(current,"desconhecido","a"),null);
 assert.equal(movePautaCardIds(current,"a","desconhecido"),null);
});
