import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 RECEIPT_LINK_TTL_MS,issueFinanceReceiptLink,parseFinanceReceiptRequest,receiptVisibleToClient,signReceiptToken,verifyReceiptToken,
} from "../src/lib/integrations/altnixFinanceReceipt";

const uuid=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const CLIENT=uuid(1),OTHER=uuid(2),RECEIPT=uuid(5);
const SECRET="k".repeat(40);
const now=Date.parse("2026-11-27T12:00:00Z");
const owned={receivableClientId:CLIENT,reversed:false,receivableExcludedFromReports:false};
const cmd={canonicalClientId:CLIENT,receiptId:RECEIPT};

test("requisição estrita: somente cliente canônico e recibo",()=>{
 assert.deepEqual(parseFinanceReceiptRequest({canonicalClientId:CLIENT,receiptId:RECEIPT}),cmd);
 for(const bad of [null,[],"x",{canonicalClientId:CLIENT},{canonicalClientId:CLIENT,receiptId:"x"},{canonicalClientId:CLIENT,receiptId:RECEIPT,url:"x"},{canonicalClientId:CLIENT,receiptId:RECEIPT,amount:1}])
  assert.equal(parseFinanceReceiptRequest(bad),null);
});

test("recibo autorizado gera link temporário assinado; nada é gravado",()=>{
 const result=issueFinanceReceiptLink(cmd,{receipt:owned,secret:SECRET,now});
 assert.equal(result.status,200);
 const url=String(result.body.url);
 assert.match(url,/^https:\/\/controle\.altnix\.com\.br\/recibo\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
 assert.equal(result.body.expiresAt,new Date(now+RECEIPT_LINK_TTL_MS).toISOString());
 const token=url.split("/recibo/")[1];
 assert.deepEqual(verifyReceiptToken(token,SECRET,now+1000),{receiptId:RECEIPT,canonicalClientId:CLIENT});
 // O link não carrega valores nem dados pessoais, apenas os dois identificadores e a validade.
 const payload=JSON.parse(Buffer.from(token.split(".")[0],"base64url").toString());
 assert.deepEqual(Object.keys(payload).sort(),["c","e","r"]);
});

test("recibo de outro cliente, estornado, de título de teste ou inexistente: 404 indistinguível",()=>{
 const notFound=issueFinanceReceiptLink(cmd,{receipt:null,secret:SECRET,now});
 for(const receipt of [{...owned,receivableClientId:OTHER},{...owned,reversed:true},{...owned,receivableExcludedFromReports:true},null]){
  const result=issueFinanceReceiptLink(cmd,{receipt,secret:SECRET,now});
  assert.deepEqual(result,notFound);assert.equal(result.status,404);
 }
 assert.equal(receiptVisibleToClient(owned,CLIENT),true);
 assert.equal(receiptVisibleToClient(owned,OTHER),false);
});

test("link expirado, adulterado, de outro segredo ou malformado é recusado",()=>{
 const {token}=signReceiptToken({receiptId:RECEIPT,canonicalClientId:CLIENT},SECRET,now);
 assert.ok(verifyReceiptToken(token,SECRET,now+RECEIPT_LINK_TTL_MS-1));
 assert.equal(verifyReceiptToken(token,SECRET,now+RECEIPT_LINK_TTL_MS+1),null,"expirado");
 assert.equal(verifyReceiptToken(token,"z".repeat(40),now),null,"outro segredo");
 assert.equal(verifyReceiptToken(token,undefined,now),null);
 assert.equal(verifyReceiptToken(token,"curto",now),null);
 const [payload,mac]=token.split(".");
 const forged=Buffer.from(JSON.stringify({r:RECEIPT,c:OTHER,e:now+RECEIPT_LINK_TTL_MS})).toString("base64url");
 assert.equal(verifyReceiptToken(`${forged}.${mac}`,SECRET,now),null,"troca de cliente no payload");
 for(const bad of ["",".",payload,`${payload}.`,`${payload}.${mac}.x`,"a".repeat(500),null,undefined,42])assert.equal(verifyReceiptToken(bad,SECRET,now),null);
});

test("rota e página: travas na ordem certa, somente leitura, sem recibo novo e sem URL permanente",()=>{
 const route=readFileSync(new URL("../src/app/api/integrations/altnix/finance-receipt/route.ts",import.meta.url),"utf8");
 assert.ok(route.indexOf("JORNALIR_FINANCE_RECEIPT_ENABLED")<route.indexOf("financeBridgeAuthorized("));
 assert.ok(route.indexOf("financeBridgeAuthorized(")<route.indexOf("allowedFinanceClient("));
 assert.ok(route.indexOf("allowedFinanceClient(")<route.indexOf('from("receivable_receipts")'));
 assert.match(route,/\.eq\("receivables\.client_id", command\.canonicalClientId\)/);
 assert.match(route,/listReportExcludedReceivableIds/);
 assert.doesNotMatch(route,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|rpc\(|storage|confirm_payment_charge/);
 const page=readFileSync(new URL("../src/app/recibo/[token]/page.tsx",import.meta.url),"utf8");
 assert.match(page,/verifyReceiptToken\(/);
 assert.match(page,/\.eq\("receivables\.client_id", verified\.canonicalClientId\)/);
 assert.match(page,/data\.reversed_at\) notFound\(\)/);
 assert.match(page,/index: false/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|rpc\(|storage/);
});
