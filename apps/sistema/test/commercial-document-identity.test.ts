import test from "node:test";
import assert from "node:assert/strict";
import {commercialDocumentId,commercialAddendumDocumentId} from "../src/lib/contracts/commercialDocumentIdentity";
const packageId="bc913d00-7d2b-47c7-9fc6-916593914761";
test("repetir a emissão do mesmo serviço não cria outro identificador de PDF",()=>{
 const first=commercialDocumentId(packageId,"1103a0d7-8bb9-4cbe-8e26-a34e2e4b9b6a");
 const retry=commercialDocumentId(packageId,"1103a0d7-8bb9-4cbe-8e26-a34e2e4b9b6a");
 assert.equal(first,retry);
 assert.match(first,/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test("serviços diferentes e contrato combinado não compartilham documento",()=>{
 const first=commercialDocumentId(packageId,"1103a0d7-8bb9-4cbe-8e26-a34e2e4b9b6a");
 const second=commercialDocumentId(packageId,"ad03f0d7-8bb9-4cbe-8e26-a34e2e4b9b6a");
 assert.notEqual(first,second);
 assert.notEqual(commercialDocumentId(packageId,null),first);
 assert.notEqual(commercialDocumentId(packageId,null),second);
});
test("o mesmo canal em outra venda gera arquivo de evidência separado",()=>{
 assert.notEqual(commercialDocumentId(packageId,null),
  commercialDocumentId("bef30fee-2d56-4d4f-9f16-31fa9574cf10",null));
});

test("aditivo mantém UUID diferente do PDF original e estável entre reexecuções",()=>{
 const addendumId="99b915c7-4754-413e-9ad9-1d55a9e8b773";
 const result=commercialAddendumDocumentId(addendumId);
 assert.equal(result,commercialAddendumDocumentId(addendumId));
 assert.notEqual(result,commercialDocumentId(packageId,null));
 assert.match(result,/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
