import test from "node:test";
import assert from "node:assert/strict";
import {ALTNIX_CADASTRO_CREATE_RELEASED,parseCadastroCreateCommand,parseCadastroLinkCommand} from "../src/lib/integrations/altnixCadastroCreateContract";
const id="11111111-1111-4111-8111-111111111111";
const cmd={operationId:id,tenantId:id,advertiserId:id,actorId:id,client:{kind:"company",document:"11.222.333/0001-81",name:"Empresa",whatsapp:"(48) 98888-7777",email:"A@example.test",city:"Praia Grande",region:"SC"}};
test("criação normaliza documento e contato, sem papéis ou financeiro vindos do caller",()=>{
 const v=parseCadastroCreateCommand(cmd);assert.ok(v);assert.equal(v.client.cnpj,"11222333000181");assert.equal(v.client.whatsapp,"48988887777");assert.equal(v.client.email,"a@example.test");assert.equal(v.client.address_state,"SC");
 assert.equal(v.client.cpf,null);assert.equal(v.client.roles,undefined);
 for(const change of [{document:"00000000000000"},{roles:["admin"]},{status:"inactive"},{whatsapp:"abc"},{region:"XX"},{city:null},{kind:"individual"}])assert.equal(parseCadastroCreateCommand({...cmd,client:{...cmd.client,...change}}),null);
 assert.equal(ALTNIX_CADASTRO_CREATE_RELEASED,false);
});

test("novo cadastro sem WhatsApp permanece permitido quando não há envio",()=>{assert.equal(parseCadastroCreateCommand({...cmd,client:{...cmd.client,whatsapp:null}})?.client.whatsapp,null);});

test("vínculo explícito exige documento válido e identidade completa; não aceita dados de cliente",()=>{
 const link={mode:"link_existing",operationId:id,tenantId:id,advertiserId:id,actorId:id,document:"11222333000181"};
 assert.equal(parseCadastroLinkCommand(link)?.document,"11222333000181");
 for(const change of [{document:"11222333000180"},{document:"11.222.333/0001-81"},{mode:"create"},{actorId:"x"},{client:cmd.client}])assert.equal(parseCadastroLinkCommand({...link,...change}),null);
 assert.equal(parseCadastroCreateCommand(link),null);
});

test("tenant principal legado é válido exclusivamente no campo tenantId",()=>{
 const tenantId="00000000-0000-0000-0000-000000000001";
 assert.equal(parseCadastroCreateCommand({...cmd,tenantId})?.tenantId,tenantId);
 assert.equal(parseCadastroCreateCommand({...cmd,actorId:tenantId}),null);
 const link={mode:"link_existing",operationId:id,tenantId,advertiserId:id,actorId:id,document:"11222333000181"};
 assert.equal(parseCadastroLinkCommand(link)?.tenantId,tenantId);
 assert.equal(parseCadastroLinkCommand({...link,advertiserId:tenantId}),null);
});
