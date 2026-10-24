import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCommercialSigners } from "../src/lib/contracts/commercialSigners";

const pair = [
 {role:"contratante" as const,name:"Maria da Silva",email:"Maria@Exemplo.com",phone:"(48) 99999-1111"},
 {role:"contratada" as const,name:"João da Silva",email:"joao@exemplo.com"},
];

test("prepara dois representantes com e-mails normalizados",()=>{
 const result=normalizeCommercialSigners(pair);
 assert.equal(result.length,2);
 assert.equal(result[0].email,"maria@exemplo.com");
 assert.equal(result[0].phone,"48999991111");
});
test("suporta testemunhas sem duplicar representantes",()=>{
 const result=normalizeCommercialSigners([...pair,{
   role:"testemunha",name:"Pessoa Testemunha",email:"testemunha@example.com",
 }]);
 assert.equal(result[2].role,"testemunha");
});
test("não aceita duas vezes o mesmo e-mail",()=>{
 assert.throws(()=>normalizeCommercialSigners([
   pair[0],{...pair[1],email:"MARIA@EXEMPLO.COM"},
 ]),/repita e-mails/);
});
test("requer ao menos um representante de cada parte",()=>{
 assert.throws(()=>normalizeCommercialSigners([
   {...pair[0],role:"testemunha"},pair[1],
 ]),/representante de cada parte/);
});
test("rejeita participantes com endereço de e-mail ou contato inválido",()=>{
 assert.throws(()=>normalizeCommercialSigners([
   pair[0],{...pair[1],email:"invalido"},
 ]),/Confira papel/);
 assert.throws(()=>normalizeCommercialSigners([
   pair[0],{...pair[1],phone:"12"},
 ]),/Confira papel/);
});
test("limita número de participantes e não permite rodada vazia",()=>{
 assert.throws(()=>normalizeCommercialSigners([]),/2 e 10/);
 assert.throws(()=>normalizeCommercialSigners([
   ...pair,...Array.from({length:9},(_,i)=>({
    role:"testemunha" as const,name:"Testemunha "+i,email:"test"+i+"@example.com",
   })),
 ]),/2 e 10/);
});
