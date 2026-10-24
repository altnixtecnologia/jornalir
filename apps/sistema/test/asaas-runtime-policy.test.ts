import test from "node:test";
import assert from "node:assert/strict";
import {canUseAsaasProductionApi,canProcessAsaasWebhook}
 from "../src/lib/financeiro/asaasRuntimePolicy";

test("API live Asaas só é acessível no runtime Vercel Production",()=>{
 assert.equal(canUseAsaasProductionApi({vercelEnv:"production",nodeEnv:"production"}),true);
 for(const input of [
  {vercelEnv:"preview",nodeEnv:"production"},
  {vercelEnv:"development",nodeEnv:"development"},
  {vercelEnv:undefined,nodeEnv:"production"},
  {vercelEnv:"production",nodeEnv:"development"},
 ])assert.equal(canUseAsaasProductionApi(input),false);
});

test("Webhooks: Production ou Preview somente com Asaas sandbox e Supabase isolado",()=>{
 assert.equal(canProcessAsaasWebhook({vercelEnv:"preview"}),false);
 assert.equal(canProcessAsaasWebhook({vercelEnv:"staging"}),false);
 assert.equal(canProcessAsaasWebhook({vercelEnv:undefined}),false);
 assert.equal(canProcessAsaasWebhook({vercelEnv:"production"}),true);
 const stage = {
   vercelEnv: "preview", asaasEnvironment: "sandbox",
   homologationEnabled: "true",
   homologationProjectRef: "abcdefghijklmnopqrst",
   supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
 };
 assert.equal(canProcessAsaasWebhook(stage),true);
 assert.equal(canProcessAsaasWebhook({...stage,asaasEnvironment:"production"}),false);
 assert.equal(canProcessAsaasWebhook({...stage,homologationEnabled:"false"}),false);
 assert.equal(canProcessAsaasWebhook({...stage,supabaseUrl:"https://iqnzrpdccecgalqboeyf.supabase.co"}),false);
 assert.equal(canProcessAsaasWebhook({...stage,homologationProjectRef:"iqnzrpdccecgalqboeyf",supabaseUrl:"https://iqnzrpdccecgalqboeyf.supabase.co"}),false);
});
