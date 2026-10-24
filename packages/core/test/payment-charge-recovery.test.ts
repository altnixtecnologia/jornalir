import test from "node:test";
import assert from "node:assert/strict";
import type {PaymentCharge} from "@ir/types";
import {PaymentChargeService} from "../src/financeiro/payment-charge-service";
import type {PaymentChargeRepository} from "../src/financeiro/payment-charge-repository";
import type {PixProvider} from "../src/financeiro/pix-provider";

test("Asaas já recebeu: registra cobrança recuperada e espera webhook com service_role",async()=>{
 let confirmed=0;
 let created:PaymentCharge|null=null;
 const repo={
  findPendingForReceivable:async()=>null,
  create:async(input:object)=>{
   created={...input,id:"charge-1",createdAt:"2026-10-24T00:00:00Z",updatedAt:"2026-10-24T00:00:00Z"} as PaymentCharge;
   return created;
  },
  confirmCharge:async()=>{confirmed++;throw new Error("RPC financeira só service_role");},
 } as unknown as PaymentChargeRepository;
 const provider={
  createCharge:async()=>({provider:"asaas" as const,providerChargeId:"pay_remote_1",
   pixCopyPaste:"",status:"paid" as const}),
  getCharge:async()=>{throw new Error("not needed")},
  cancelCharge:async()=>{throw new Error("not needed")},
 } satisfies PixProvider;
 const result=await new PaymentChargeService(repo,provider).createPixCharge({
  receivableId:"r1",clientId:"c1",amount:100,
 });
 assert.equal(confirmed,0);
 assert.equal(result.status,"pending");
 assert.equal(result.providerChargeId,"pay_remote_1");
 assert.equal(created?.status,"pending");
});
