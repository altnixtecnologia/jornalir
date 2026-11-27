import {test} from "node:test";
import assert from "node:assert/strict";
import {inspectExistingAsaasCharges} from "../src/lib/financeiro/asaasExistingChargesRead";
const row={id:"local-1",provider_charge_id:"pay_test",status:"paid",amount:5};
test("consulta somente GET e retorna exclusivamente metadados da cobrança",async()=>{
 const fake=async(url:RequestInfo|URL,opts?:RequestInit)=>{assert.equal(url,"https://api.asaas.com/v3/payments/pay_test");assert.equal(opts?.method,"GET");assert.equal(opts?.redirect,"error");assert.equal(opts?.body,undefined);return Response.json({id:"pay_test",status:"RECEIVED",value:5,customer:"private",refunds:[]});};
 assert.deepEqual(await inspectExistingAsaasCharges([row],"test",fake),[{id:"local-1",localStatus:"paid",localAmount:5,providerStatus:"RECEIVED",providerAmount:5,result:"verified",reason:"Status e valor correspondentes"}]);
});
test("divergência e estorno nunca autorizam baixa",async()=>{
 for(const change of [{value:4},{status:"REFUNDED"},{refunds:[{}]}]){
  const [r]=await inspectExistingAsaasCharges([row],"test",async()=>Response.json({id:"pay_test",status:"RECEIVED",value:5,...change}));
  assert.equal(r.result,"review");
 }
 const [r]=await inspectExistingAsaasCharges([row],"test",async()=>Response.json({id:"pay_other",status:"RECEIVED",value:5}));
 assert.equal(r.result,"unverified");
});
test("não consulta referência inválida, limita lote e recusa ausência de chave",async()=>{
 let count=0;const fake=async()=>{count++;return Response.json({});};
 assert.equal((await inspectExistingAsaasCharges([{...row,provider_charge_id:"../customers"}],"test",fake))[0].result,"unverified");
 await assert.rejects(inspectExistingAsaasCharges(Array(11).fill(row),"test",fake));
 await assert.rejects(inspectExistingAsaasCharges([row],"",fake));assert.equal(count,0);
});
