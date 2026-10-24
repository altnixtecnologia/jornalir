import test from "node:test";
import assert from "node:assert/strict";
import {publicationStatus,validateSiteAdPublication} from "../src/features/configuracoes/siteAdPublicationPolicy";
test("vigência e pausa explícitas não misturam dívida do cliente com anúncios gratuitos",()=>{
 assert.deepEqual(validateSiteAdPublication({active:false,activeFrom:"",activeUntil:null}),{active:false,activeFrom:undefined,activeUntil:undefined});
 assert.equal(publicationStatus({active:false},"2026-10-24"),"suspended");
 assert.equal(publicationStatus({active:true,activeFrom:"2026-10-25"},"2026-10-24"),"scheduled");
 assert.equal(publicationStatus({active:true,activeUntil:"2026-10-23"},"2026-10-24"),"expired");
 assert.equal(publicationStatus({active:true,activeFrom:"2026-10-24",activeUntil:"2026-10-24"},"2026-10-24"),"active");
});
test("datas falsas e ordem inversa são recusadas",()=>{
 for(const activeFrom of ["2026-02-29","10/24/2026","2026-13-01","2026-04-31"]){
 assert.throws(()=>validateSiteAdPublication({active:true,activeFrom,activeUntil:null}));
 }
 assert.throws(()=>validateSiteAdPublication({active:true,activeFrom:"2026-10-25",activeUntil:"2026-10-24"}));
 assert.throws(()=>validateSiteAdPublication({active:"true" as unknown as boolean,activeFrom:null,activeUntil:null}));
});
