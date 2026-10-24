import test from "node:test";
import assert from "node:assert/strict";
import {describeAuthMailError} from "../src/lib/auth/authMailDiagnostics";
test("bloqueio do SMTP padrão exibe orientação específica",()=>{
 assert.match(describeAuthMailError({message:"Email address not authorized"}),/SMTP próprio/);
});
test("distingue limite, redirect e conta já existente",()=>{
 assert.match(describeAuthMailError({status:429}),/Limite/);
 assert.match(describeAuthMailError({message:"redirect URL is not allowed"}),/URL/);
 assert.match(describeAuthMailError({message:"user already registered"}),/já possui conta/);
});
test("erro desconhecido nunca confirma entrega",()=>{
 assert.doesNotMatch(describeAuthMailError(null),/entregue|recebido/i);
});
