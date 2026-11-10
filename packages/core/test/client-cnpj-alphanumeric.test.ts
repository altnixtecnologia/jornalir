import test from "node:test";
import assert from "node:assert/strict";
import {ClientService} from "../src/clientes/client-service";
import {isValidCnpj,normalizeCnpj} from "../src/clientes/client-validation";
import type {ClientRepository} from "../src/clientes/client-repository";
import type {Client} from "@ir/types";

test("CNPJ numérico histórico continua válido",()=>{
 assert.equal(isValidCnpj("11.222.333/0001-81"),true);
 assert.equal(normalizeCnpj("11.222.333/0001-81"),"11222333000181");
 assert.equal(isValidCnpj("00.000.000/0000-00"),false);
});
test("CNPJ alfanumérico oficial de julho de 2026 usa DV ASCII-48",()=>{
 assert.equal(normalizeCnpj("00.000.000/e08g-12"),"00000000E08G12");
 assert.equal(isValidCnpj("00.000.000/e08g-12"),true);
 assert.equal(isValidCnpj("00.000.000/E08G-13"),false);
 assert.equal(isValidCnpj("00.000.000/E08G-AA"),false);
 assert.equal(isValidCnpj("00.000.000/E08G-1"),false);
});
test("ClientService preserva letras e campos fiscais; não escreve aniversariantes",async()=>{
 let received:Client|undefined;
 const db:ClientRepository={
  list:async()=>[],
  getById:async()=>null,
  create:async record=>{
   received={...record,id:"c1",reference:"C1",createdAt:"2026-11-10T00:00:00Z",updatedAt:"2026-11-10T00:00:00Z"} as Client;
   return received;
  },
  update:async()=>{throw new Error("Não deve atualizar");}
 };
 const service=new ClientService(db);
 await service.register({
  kind:"company",status:"active",companyName:"Empresa Teste",
  cnpj:"00.000.000/e08g-12",email:"Contato@Empresa.com",
  fiscalEmail:"FISCAL@Empresa.com",municipalRegistration:"12345",
  addressIbgeCode:"4205407",icmsStatus:"nao_contribuinte",
  roles:["cliente"]
 });
 assert.equal(received?.cnpj,"00000000E08G12");
 assert.equal(received?.email,"contato@empresa.com");
 assert.equal(received?.fiscalEmail,"fiscal@empresa.com");
 assert.equal(received?.municipalRegistration,"12345");
 assert.equal(received?.addressIbgeCode,"4205407");
 assert.equal(received?.icmsStatus,"nao_contribuinte");
});
test("ClientService barra código IBGE inválido",async()=>{
 const db:ClientRepository={
  list:async()=>[],getById:async()=>null,
  create:async()=>{throw new Error("Não deveria chamar banco");},
  update:async()=>{throw new Error("Não deveria atualizar");}
 };
 const service=new ClientService(db);
 assert.throws(()=>service.register({
  kind:"company",companyName:"Exemplo",cnpj:"00.000.000/E08G-12",addressIbgeCode:"123",roles:["cliente"]
 }),/IBGE/);
});
