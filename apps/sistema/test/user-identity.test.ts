import test from "node:test";
import assert from "node:assert/strict";
import {normalizeStaffName,hasRealStaffName,staffNameLabel} from "../src/lib/auth/userIdentity";
test("aceita nome humano e preserva acentos",()=>{
 assert.equal(normalizeStaffName("  Maria  de   Oliveira  "),"Maria de Oliveira");
 assert.equal(staffNameLabel("Maria de Oliveira","maria@empresa.com"),"Maria de Oliveira");
});
test("não mostra prefixo do e-mail como nome cadastral",()=>{
 assert.equal(hasRealStaffName("contato","contato@empresa.com"),false);
 assert.equal(staffNameLabel("contato","contato@empresa.com"),"Nome não informado");
});
test("dados antigos vazios ou inválidos precisam de edição",()=>{
 assert.equal(staffNameLabel("","exemplo@empresa.com"),"Nome não informado");
 assert.equal(staffNameLabel("test@example.com","test@example.com"),"Nome não informado");
 assert.equal(normalizeStaffName("a"),null);
});
test("sem e-mail disponível usa o nome legítimo informado",()=>{
 assert.equal(staffNameLabel("Ana Paula",null),"Ana Paula");
});
