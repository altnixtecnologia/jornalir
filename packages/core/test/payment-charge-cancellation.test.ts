import test from "node:test";
import assert from "node:assert/strict";
import type {PaymentCharge} from "@ir/types";
import {PaymentChargeService} from "../src/financeiro/payment-charge-service";
import type {PaymentChargeRepository} from "../src/financeiro/payment-charge-repository";
import type {PixProvider,PixChargeProviderResult} from "../src/financeiro/pix-provider";

function mock(remote:"cancelled"|"paid"|"pending",failCancel:boolean,failLookup=false){
 let updateCount=0,cancelCount=0;
 const charge={id:"id-1",status:"pending",providerChargeId:"asaas-1",
   receivableId:"r1",clientId:"c1",amount:100} as PaymentCharge;
 const repo={
  getById:async()=>charge,
  update:async(_id:string,changes:Partial<PaymentCharge>)=>{
   updateCount++;Object.assign(charge,changes);return charge;
  },
 } as unknown as PaymentChargeRepository;
 const provider={
  createCharge:async()=>{throw new Error("não criar")},
  cancelCharge:async()=>{cancelCount++;if(failCancel)throw new Error("timeout provedor");},
  getCharge:async()=>{if(failLookup)throw new Error("sem conexão");
   return {provider:"asaas",providerChargeId:"asaas-1",
    pixCopyPaste:"",status:remote} as PixChargeProviderResult;
  },
 } satisfies PixProvider;
 return {service:new PaymentChargeService(repo,provider),
  get updates(){return updateCount;},get cancellations(){return cancelCount;}};
}
const args={cancelledByProfileId:"admin",cancellationReason:"Solicitação registrada pelo cliente"};
test("timeout após cancelamento remoto permite reconciliar cobrança cancelada",async()=>{
 const t=mock("cancelled",true);
 const result=await t.service.cancelPixCharge("id-1",args);
 assert.equal(result.status,"cancelled");
 assert.equal(t.updates,1);
});
test("se o Asaas recebeu o Pix, cancelar não marca a cobrança local como cancelada",async()=>{
 const t=mock("paid",true);
 await assert.rejects(t.service.cancelPixCharge("id-1",args),/já recebida no Asaas/);
 assert.equal(t.updates,0);
});
test("falha de rede na verificação não é assumida como cancelamento bem sucedido",async()=>{
 const t=mock("pending",true,true);
 await assert.rejects(t.service.cancelPixCharge("id-1",args),/timeout provedor/);
 assert.equal(t.updates,0);
});
test("repetir cancelamento local já concluído é idempotente",async()=>{
 const t=mock("pending",false);
 await t.service.cancelPixCharge("id-1",args);
 await t.service.cancelPixCharge("id-1",args);
 assert.equal(t.cancellations,1);
 assert.equal(t.updates,1);
});
