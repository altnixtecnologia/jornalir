import test from "node:test";
import assert from "node:assert/strict";
import { staffAuthRedirectUrl } from "../src/lib/auth/staffAuthRedirect";

test("produção usa domínio oficial HTTPS e paths corretos",()=>{
 assert.equal(staffAuthRedirectUrl({production:true}),
   "https://controle.altnix.com.br/definir-senha");
 assert.equal(staffAuthRedirectUrl({production:true,configuredBaseUrl:"https://controle.altnix.com.br/",recovery:true}),
   "https://controle.altnix.com.br/definir-senha?recovery=1");
});

test("ambientes preview, HTTP e domínios externos são proibidos em produção",()=>{
 for(const url of ["http://controle.altnix.com.br","https://controle.altnix.com.br.evil.invalid",
 "https://jornalir.vercel.app","https://controle.altnix.com.br:8443"]) {
  assert.throws(()=>staffAuthRedirectUrl({production:true,configuredBaseUrl:url}),/bloqueados/);
 }
});

test("nunca enviar tokens para URLs com query, credenciais ou caminhos",()=>{
 for(const url of ["https://controle.altnix.com.br/phishing",
  "https://user:pass@controle.altnix.com.br","https://controle.altnix.com.br/?dest=evil",
  "javascript:alert(1)","not a url"]) {
  assert.throws(()=>staffAuthRedirectUrl({production:true,configuredBaseUrl:url}));
 }
});

test("desenvolvimento local usa HTTP localhost; externo exige HTTPS",()=>{
 assert.equal(staffAuthRedirectUrl({production:false}),"http://localhost:3001/definir-senha");
 assert.equal(staffAuthRedirectUrl({production:false,configuredBaseUrl:"http://127.0.0.1:3001",recovery:true}),
  "http://127.0.0.1:3001/definir-senha?recovery=1");
 assert.throws(()=>staffAuthRedirectUrl({production:false,configuredBaseUrl:"http://example.com"}),/HTTP/);
});
