/** Consulta individual somente de referências já existentes no banco.
 * A Server Action fornece a identidade persistida e a chave do ambiente.
 * Nunca chama emissão, baixa, estorno, cancelamento ou configuração.
 */
export type ExistingCharge={id:string;provider_charge_id:string|null;status:string;amount:number|string};
export type ChargeRead={id:string;localStatus:string;localAmount:number;providerStatus:string|null;providerAmount:number|null;result:"verified"|"unverified"|"review";reason:string};
export async function inspectExistingAsaasCharges(rows:ExistingCharge[],key:string,fetcher:typeof fetch=fetch):Promise<ChargeRead[]>{
 if(!key||rows.length>10)throw new Error("Consulta limitada a 10 cobranças.");
 const out:ChargeRead[]=[];
 for(const row of rows){
  const result:ChargeRead={id:row.id,localStatus:row.status,localAmount:Number(row.amount),providerStatus:null,providerAmount:null,result:"unverified",reason:"Referência não confirmada"};
  const id=row.provider_charge_id;
  if(!id||!/^pay_[A-Za-z0-9_-]{1,128}$/.test(id)||!Number.isFinite(result.localAmount)||result.localAmount<0){out.push(result);continue;}
  try{
   const response=await fetcher("https://api.asaas.com/v3/payments/"+encodeURIComponent(id),{method:"GET",headers:{accept:"application/json","User-Agent":"InformativoRegional/1.0",access_token:key},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000)});
   if(!response.ok){result.reason="Asaas HTTP "+response.status;out.push(result);continue;}
   const data:unknown=await response.json();
   if(!data||typeof data!=="object"){out.push(result);continue;}
   const p=data as Record<string,unknown>;
   if(p.id!==id||typeof p.status!=="string"||! /^[A-Z_]{1,64}$/.test(p.status)||typeof p.value!=="number"||!Number.isFinite(p.value)||p.value<0){out.push(result);continue;}
   result.providerStatus=p.deleted===true?"DELETED":p.status;result.providerAmount=p.value;
   const sameAmount=Math.round(p.value*100)===Math.round(result.localAmount*100);
   const sameState=(row.status==="paid"&&["RECEIVED","RECEIVED_IN_CASH"].includes(result.providerStatus))||(row.status==="cancelled"&&result.providerStatus==="DELETED")||(row.status==="pending"&&["PENDING","OVERDUE","CONFIRMED"].includes(result.providerStatus));
   const refund=Array.isArray(p.refunds)&&p.refunds.length>0;
   result.result=sameAmount&&sameState&&!refund?"verified":"review";
   result.reason=result.result==="verified"?"Status e valor correspondentes":"Conferir divergência, estorno ou estado externo";
  }catch{result.reason="Consulta indisponível";}
  out.push(result);
 }
 return out;
}
