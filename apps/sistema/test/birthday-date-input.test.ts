import test from "node:test";
import assert from "node:assert/strict";
import {parseBirthdayDateInput,yearInputFromBirthday,dayMonthInputFromBirthday} from "../src/features/aniversariantes/birthdayDateInput";
test("dia e mês sem ano não inventam nascimento: flag false",()=>{
 assert.deepEqual(parseBirthdayDateInput("29/02",""),{birthDate:"2000-02-29",birthYearKnown:false});
 assert.equal(yearInputFromBirthday("2000-02-29",false),"");
 assert.equal(dayMonthInputFromBirthday("2000-02-29"),"29/02");
});
test("ano real 2000 não é confundido com data virtual",()=>{
 assert.deepEqual(parseBirthdayDateInput("29/02","2000"),{birthDate:"2000-02-29",birthYearKnown:true});
 assert.equal(yearInputFromBirthday("2000-02-29",true),"2000");
});
test("data inválida, 29/02 em ano não bissexto e caracteres estranhos rejeitados",()=>{
 for(const [day,year] of [["31/04",""],["29/02","2025"],["00/12",""],["10/13",""],["",""],["12/12","2"],["12/12","1888"],["12/12","2101"],["aa/10",""]]){
  assert.equal(parseBirthdayDateInput(day,year),null,`${day}/${year}`);
 }
});
