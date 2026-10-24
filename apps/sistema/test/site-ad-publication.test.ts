import test from "node:test";
import assert from "node:assert/strict";
import {publicationStatus,validateSiteAdPublication}
 from "../src/features/configuracoes/siteAdPublicationPolicy";

test("patrocinador do portal é bônus manual, sem cobrança, cadastro ou vencimento",()=>{
 assert.deepEqual(validateSiteAdPublication({active:true}),{active:true});
 assert.deepEqual(validateSiteAdPublication({active:false}),{active:false});
 assert.equal(publicationStatus({active:true}),"active");
 assert.equal(publicationStatus({active:false}),"suspended");
});
test("entrada não booleana não permite pausar ou ativar por engano",()=>{
 for(const active of ["true",1,null,undefined]){
  assert.throws(()=>validateSiteAdPublication({active:active as boolean}));
 }
});
