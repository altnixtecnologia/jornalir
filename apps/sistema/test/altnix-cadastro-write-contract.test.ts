import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ALTNIX_CADASTRO_WRITE_RELEASED,parseCadastroWriteCommand} from "../src/lib/integrations/altnixCadastroWriteContract";
const id="11111111-1111-4111-8111-111111111111";
const cmd={operationId:id,tenantId:id,advertiserId:id,actorId:id,canonicalClientId:id,expectedUpdatedAt:"2026-11-26T12:00:00.123456+00:00",patch:{name:" Empresa ",phone:"(48) 3333-4444",whatsapp:"+55 48 98888-7777",email:"A@EXAMPLE.TEST",postalCode:"88900-000"}};
test("valida e normaliza somente campos comuns; mantém timestamp exato",()=>{
 const v=parseCadastroWriteCommand(cmd);
 assert.ok(v);assert.equal(v.expectedUpdatedAt,cmd.expectedUpdatedAt);
 assert.deepEqual(v.patch,{name:"Empresa",phone:"4833334444",whatsapp:"48988887777",email:"a@example.test",postalCode:"88900000"});
 for(const patch of [{cpf:"123"},{document:"123"},{roles:["admin"]},{city:"Outra"},{region:"SP"},{status:"inactive"},{phone:"abc"},{email:"x"},{name:" "},{}, {name:42}]) assert.equal(parseCadastroWriteCommand({...cmd,patch}),null);
 for(const change of [{actorId:"wrong"},{expectedUpdatedAt:"bad"},{unknown:1}])assert.equal(parseCadastroWriteCommand({...cmd,...change}),null);
});
test("trava de release e segredo de escrita separado",()=>{
 assert.equal(ALTNIX_CADASTRO_WRITE_RELEASED,false);
 const route=readFileSync(new URL("../src/app/api/integrations/altnix/clients/update/route.ts",import.meta.url),"utf8");
 assert.match(route,/!ALTNIX_CADASTRO_WRITE_RELEASED/);
 assert.match(route,/ALTNIX_CLIENT_WRITE_SECRET/);
 assert.doesNotMatch(route,/ALTNIX_CLIENT_SYNC_SECRET/);
 assert.match(route,/apply_altnix_client_update/);
});

test("preserva contato opcional; limpar WhatsApp ou e-mail não usa telefone como substituto",()=>{assert.deepEqual(parseCadastroWriteCommand({...cmd,patch:{whatsapp:null,email:null}})?.patch,{whatsapp:null,email:null});});
