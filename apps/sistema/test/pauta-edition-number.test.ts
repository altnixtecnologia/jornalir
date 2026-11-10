import test from "node:test";
import assert from "node:assert/strict";
import {automaticPautaEditionNumber} from "../src/features/agenda/pautaEdition";
test("Pauta 05 a 11 de novembro de 2026 = edição 777",()=>{
 assert.equal(automaticPautaEditionNumber("2026-11-05"),777);
 assert.equal(automaticPautaEditionNumber("2026-11-12"),778);
 assert.equal(automaticPautaEditionNumber("2026-10-29"),776);
 assert.equal(automaticPautaEditionNumber("2026-12-17"),783);
});
test("Edição automática independe do período especial dentro da semana",()=>{
 assert.equal(automaticPautaEditionNumber("2026-12-17"),783);
 assert.throws(()=>automaticPautaEditionNumber("data-inválida"),/Semana editorial inválida/);
});
