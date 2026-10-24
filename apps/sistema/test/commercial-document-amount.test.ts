import test from "node:test";
import assert from "node:assert/strict";
import { commercialDocumentAmount } from "../src/lib/contracts/commercialDocumentAmount";

test("documento combinado usa o valor total da venda",()=>{
 assert.equal(commercialDocumentAmount("combined",475,{totalAmount:200}),475);
});
test("documentos separados preservam valor de cada serviço",()=>{
 assert.equal(commercialDocumentAmount("separate",475,{totalAmount:200}),200);
 assert.equal(commercialDocumentAmount("separate",475,{totalAmount:275}),275);
});
test("valor inválido ou ausente bloqueia o documento",()=>{
 assert.throws(()=>commercialDocumentAmount("separate",475,{}),/Valor histórico/);
 assert.throws(()=>commercialDocumentAmount("separate",475,{totalAmount:"200"}),/Valor histórico/);
 assert.throws(()=>commercialDocumentAmount("combined",NaN),/Valor histórico/);
 assert.throws(()=>commercialDocumentAmount("combined",-1),/Valor histórico/);
});
test("valor zero explicitamente negociado é válido",()=>{
 assert.equal(commercialDocumentAmount("separate",475,{totalAmount:0}),0);
});
