import test from "node:test";
import assert from "node:assert/strict";
import {movePautaCardIds,togglePautaOpenId} from "../src/features/agenda/pautaCardOrdering";
test("arrastar pela alça altera a posição, sem perder IDs",()=>{
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

test("somente uma pauta aberta; clique novamente fecha",()=>{
 assert.equal(togglePautaOpenId(null,"a"),"a");
 assert.equal(togglePautaOpenId("a","b"),"b");
 assert.equal(togglePautaOpenId("b","b"),null);
});
