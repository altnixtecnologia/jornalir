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

test("Preview não processa webhooks de cobranças com service_role",()=>{
 assert.equal(canProcessAsaasWebhook({vercelEnv:"preview"}),false);
 assert.equal(canProcessAsaasWebhook({vercelEnv:"production"}),true);
});
