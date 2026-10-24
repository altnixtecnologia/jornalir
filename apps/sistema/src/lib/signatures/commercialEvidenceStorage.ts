import {createHash} from "node:crypto";
import type {createSupabaseAdminClient} from "../supabase/admin";

type EvidenceFormat="application/pdf"|"image/jpeg";
interface EvidenceInput {
 bucket:"contract-documents"|"contract-signatures";
 path:string;
 format:EvidenceFormat;
 candidate?:Uint8Array;
 expectedSha256?:string;
}
export interface StoredCommercialEvidence {bytes:Buffer;sha256:string;reused:boolean}

export function sha256Evidence(bytes:Uint8Array):string {
 return createHash("sha256").update(bytes).digest("hex");
}
function validateEvidence(bytes:Buffer,format:EvidenceFormat):void {
 const magic=format==="application/pdf"?"%PDF-":"\xff\xd8\xff";
 const prefix=Buffer.from(magic,format==="application/pdf"?"utf8":"latin1");
 if(bytes.length<150 || !bytes.subarray(0,prefix.length).equals(prefix)){
  throw new Error("Arquivo de evidência existente não corresponde ao formato esperado.");
 }
}
function isDefinitelyMissing(error:{message?:string;statusCode?:string|number;status?:number}):boolean {
 const status=String(error.statusCode??error.status??"");
 const msg=(error.message??"").toLowerCase();
 return status==="404" || msg.includes("object not found") || msg.includes("not found");
}
/**
 * Nunca sobrescreve uma evidência anterior. Se uma tentativa parou após
 * gravar o primeiro/segundo arquivo, reutiliza o arquivo já presente.
 * A verificação usa o SHA persistido da assinatura JPEG para impedir que
 * uma nova tentativa troque silenciosamente a representação gráfica.
 * Erros de rede/autenticação NÃO são interpretados como arquivo ausente.
 */
export async function persistCommercialEvidence(
 admin:ReturnType<typeof createSupabaseAdminClient>,input:EvidenceInput,
):Promise<StoredCommercialEvidence> {
 const storage=admin.storage.from(input.bucket);
 async function existing():Promise<StoredCommercialEvidence|null>{
  const {data,error}=await storage.download(input.path);
  if(error){
   if(isDefinitelyMissing(error)) return null;
   throw new Error("Falha ao consultar evidência já armazenada: "+error.message);
  }
  if(!data) throw new Error("Storage retornou arquivo inválido.");
  const bytes=Buffer.from(await data.arrayBuffer());
  validateEvidence(bytes,input.format);
  const sha256=sha256Evidence(bytes);
  if(input.expectedSha256 && sha256!==input.expectedSha256){
   throw new Error("Evidência armazenada difere da tentativa registrada. Reconciliação manual obrigatória.");
  }
  return {bytes,sha256,reused:true};
 }
 const prior=await existing();
 if(prior) return prior;
 if(!input.candidate) throw new Error("Evidência da tentativa anterior está ausente.");
 const candidate=Buffer.from(input.candidate);
 validateEvidence(candidate,input.format);
 const digest=sha256Evidence(candidate);
 if(input.expectedSha256 && digest!==input.expectedSha256){
  throw new Error("Nova evidência não corresponde ao hash registrado.");
 }
 const {error}=await storage.upload(input.path,candidate,{
  contentType:input.format,cacheControl:"0",upsert:false,
 });
 if(error){
  // Uma chamada concorrente pode ter gravado o objeto depois da leitura.
  // Nunca substituir: verificar novamente o arquivo existente.
  if(String((error as {statusCode?:string}).statusCode)==="409" ||
     /already exists|duplicate|resource already exists/i.test(error.message)){
   const raced=await existing();
   if(raced) return raced;
  }
  throw new Error("Falha ao gravar evidência comercial: "+error.message);
 }
 return {bytes:candidate,sha256:digest,reused:false};
}
