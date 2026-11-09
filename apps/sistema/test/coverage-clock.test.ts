import test from "node:test";
import assert from "node:assert/strict";
import {coverageClockAt,coverageMinutesBefore,validCoverageClock} from "../src/features/agenda/coverageClock";
test("padrões de 1h e cinco minutos são horários HH:MM que podem ser alterados",()=>{
 assert.equal(coverageClockAt("18:30",60),"17:30");
 assert.equal(coverageClockAt("18:30",5),"18:25");
 assert.equal(coverageMinutesBefore("18:30","17:17"),73);
 assert.equal(coverageMinutesBefore("18:30","18:45"),-15);
});
test("evento à meia-noite considera aviso do dia anterior",()=>{
 assert.equal(coverageClockAt("00:30",60),"23:30");
 assert.equal(coverageMinutesBefore("00:30","23:30"),60);
 assert.equal(coverageMinutesBefore("23:50","00:10"),-20);
});
test("não aceita horário inválido",()=>{
 assert.equal(coverageMinutesBefore("18:30","25:18"),null);
 assert.equal(validCoverageClock("18:05"),true);
 assert.equal(validCoverageClock("18:65"),false);
});
