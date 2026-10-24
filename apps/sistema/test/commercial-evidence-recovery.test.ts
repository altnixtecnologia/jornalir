import test from "node:test";
import assert from "node:assert/strict";
import {
 persistCommercialEvidence,sha256Evidence,
} from "../src/lib/signatures/commercialEvidenceStorage";

const pdf=Buffer.concat([Buffer.from("%PDF-1.4\n"),Buffer.alloc(400,65)]);
const otherPdf=Buffer.concat([Buffer.from("%PDF-1.4\n"),Buffer.alloc(400,66)]);
const jpeg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(400,10)]);
type FakeRead={data:Blob|null;error:{message:string;statusCode:string}|null};
function memoryStorage() {
 const objects=new Map<string,Uint8Array>();
 let uploads=0;
 let failAt=0;
 let cannotRead=false;
 const admin={
  storage:{from:(bucket:string)=>({
   download:async(path:string):Promise<FakeRead>=>{
    if(cannotRead) return {data:null,error:{message:"storage connection failed",statusCode:"503"}};
    const bytes=objects.get(bucket+"/"+path);
    return bytes?{data:new Blob([Buffer.from(bytes)]),error:null}:
       {data:null,error:{message:"Object not found",statusCode:"404"}};
   },
   upload:async(path:string,bytes:Uint8Array)=>{
    uploads++;
    if(uploads===failAt) return {error:{message:"storage unavailable",statusCode:"503"}};
    const key=bucket+"/"+path;
    if(objects.has(key)) return {error:{message:"The resource already exists",statusCode:"409"}};
    objects.set(key,Buffer.from(bytes));
    return {error:null};
   }
  })}
 };
 return {admin:admin as unknown as Parameters<typeof persistCommercialEvidence>[0],
  objects,get uploads(){return uploads;},
  failAt:(n:number)=>{failAt=n;},
  unreadable:()=>{cannotRead=true}};
}
test("reexecutar uma evidência não duplica upload e preserva hash anterior",async()=>{
 const store=memoryStorage();
 const params={bucket:"contract-documents" as const,path:"commercial-signatures/r/i-receipt.pdf",
  format:"application/pdf" as const,candidate:pdf};
 const first=await persistCommercialEvidence(store.admin,params);
 const second=await persistCommercialEvidence(store.admin,{...params,candidate:otherPdf});
 assert.equal(first.reused,false);
 assert.equal(second.reused,true);
 assert.equal(second.sha256,sha256Evidence(pdf));
 assert.equal(store.uploads,1);
});
test("recupera depois da falha no segundo arquivo sem sobrescrever o primeiro",async()=>{
 const store=memoryStorage();
 store.failAt(2);
 await persistCommercialEvidence(store.admin,{
  bucket:"contract-signatures",path:"commercial/a.jpg",format:"image/jpeg",
  candidate:jpeg,expectedSha256:sha256Evidence(jpeg),
 });
 await assert.rejects(persistCommercialEvidence(store.admin,{
  bucket:"contract-documents",path:"commercial-signatures/r/a-receipt.pdf",
  format:"application/pdf",candidate:pdf,
 }),/Falha ao gravar/);
 const recovered=await persistCommercialEvidence(store.admin,{
  bucket:"contract-signatures",path:"commercial/a.jpg",format:"image/jpeg",
  candidate:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(400,5)]),
  expectedSha256:sha256Evidence(jpeg),
 });
 assert.equal(recovered.reused,true);
 const final=await persistCommercialEvidence(store.admin,{
  bucket:"contract-documents",path:"commercial-signatures/r/a-receipt.pdf",
  format:"application/pdf",candidate:pdf,
 });
 assert.equal(final.reused,false);
 assert.equal(store.objects.size,2);
});
test("recusa recuperação quando JPEG armazenado não corresponde ao hash da tentativa",async()=>{
 const store=memoryStorage();
 await persistCommercialEvidence(store.admin,{
  bucket:"contract-signatures",path:"commercial/a.jpg",format:"image/jpeg",candidate:jpeg,
 });
 await assert.rejects(persistCommercialEvidence(store.admin,{
  bucket:"contract-signatures",path:"commercial/a.jpg",format:"image/jpeg",
  candidate:jpeg,expectedSha256:sha256Evidence(pdf),
 }),/difere da tentativa/);
});
test("erro de rede não é interpretado como arquivo ausente ou autorização para substituir",async()=>{
 const store=memoryStorage();store.unreadable();
 await assert.rejects(persistCommercialEvidence(store.admin,{
  bucket:"contract-documents",path:"commercial-signatures/r/a-signed.pdf",
  format:"application/pdf",candidate:pdf,
 }),/Falha ao consultar/);
 assert.equal(store.uploads,0);
});
test("sem JPEG anterior e com hash divergente exige recuperação controlada",async()=>{
 const store=memoryStorage();
 await assert.rejects(persistCommercialEvidence(store.admin,{
  bucket:"contract-signatures",path:"commercial/a.jpg",format:"image/jpeg",
  candidate:jpeg,expectedSha256:sha256Evidence(pdf),
 }),/hash registrado/);
 assert.equal(store.uploads,0);
});

test("falha ao gravar PDF final: tentativa reusa JPEG e comprovante sem apagar histórico",async()=>{
 const store=memoryStorage();store.failAt(3);
 const entries=[
  {bucket:"contract-signatures" as const,path:"commercial/last.jpg",format:"image/jpeg" as const,candidate:jpeg},
  {bucket:"contract-documents" as const,path:"commercial-signatures/r/last-receipt.pdf",format:"application/pdf" as const,candidate:pdf},
  {bucket:"contract-documents" as const,path:"commercial-signatures/r/last-signed.pdf",format:"application/pdf" as const,candidate:otherPdf},
 ];
 for(const file of entries.slice(0,2)) await persistCommercialEvidence(store.admin,file);
 await assert.rejects(persistCommercialEvidence(store.admin,entries[2]),/Falha ao gravar/);
 assert.equal(store.objects.size,2);
 const first=await persistCommercialEvidence(store.admin,entries[0]);
 const second=await persistCommercialEvidence(store.admin,entries[1]);
 const third=await persistCommercialEvidence(store.admin,entries[2]);
 assert.equal(first.reused,true);
 assert.equal(second.reused,true);
 assert.equal(third.reused,false);
 assert.equal(store.objects.size,3);
 assert.equal(store.uploads,4);
});
