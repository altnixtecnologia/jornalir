import test from "node:test";
import assert from "node:assert/strict";
import type { Client } from "@ir/types";
import { qualifyCommercialClient } from "../src/lib/contracts/commercialQualification";

const address = { street:"Rua Exemplo",number:"123",neighborhood:"Centro",city:"São João do Sul",state:"SC",zip:"88970000" };
const base = { id:"cli-1",reference:"IR-CLI-1",status:"active",address,
  roles:["cliente"],createdAt:"2026-10-01",updatedAt:"2026-10-01" } as unknown as Client;

test("pessoa física completa gera qualificação a partir do cadastro",()=>{
 const person = {...base,kind:"individual",fullName:"Pessoa Exemplo",cpf:"12345678909"} as Client;
 const result = qualifyCommercialClient(person);
 assert.deepEqual(result.missing,[]);
 assert.equal(result.variables["cliente.nome"],"Pessoa Exemplo");
 assert.match(result.variables["cliente.qualificacao"],/CPF 12345678909/);
});
test("pessoa jurídica requer razão social, CNPJ e representante",()=>{
 const company = {...base,kind:"company",tradeName:"Fantasia",companyName:"Empresa Ltda",cnpj:"11222333000181"} as Client;
 const result = qualifyCommercialClient(company);
 assert.ok(result.missing.includes("Cliente: responsável legal"));
 assert.ok(result.missing.includes("Cliente: CPF do responsável legal"));
 assert.equal(result.variables["cliente.nome"],"Empresa Ltda");
});
test("endereço incompleto impede emissão de minuta jurídica",()=>{
 const incomplete = {...base,kind:"individual",fullName:"Cliente",cpf:"12345678909",
   address:{city:"São João do Sul"}} as Client;
 const result = qualifyCommercialClient(incomplete);
 assert.ok(result.missing.some(item=>item.includes("logradouro")));
 assert.ok(result.missing.some(item=>item.includes("CEP")));
});
test("empresa completa usa representante cadastrado",()=>{
 const company = {...base,kind:"company",companyName:"Empresa Ltda",cnpj:"11222333000181",
  responsibleName:"Representante Legal",responsibleCpf:"12345678909"} as Client;
 const result = qualifyCommercialClient(company);
 assert.deepEqual(result.missing,[]);
 assert.equal(result.variables["cliente.representante"],"Representante Legal");
});
