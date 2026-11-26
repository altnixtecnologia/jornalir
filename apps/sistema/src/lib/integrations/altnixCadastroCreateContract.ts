import { isValidCpf,isValidCnpj,normalizeCnpj,onlyDigits } from "@ir/core";
import { parseCadastroWriteCommand } from "./altnixCadastroWriteContract";
export const ALTNIX_CADASTRO_CREATE_RELEASED=false as boolean;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CreateCommand={operationId:string;tenantId:string;advertiserId:string;actorId:string;client:Record<string,string|null>};
export function parseCadastroCreateCommand(raw:unknown):CreateCommand|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).length!==5||!["operationId","tenantId","advertiserId","actorId"].every(k=>typeof v[k]==="string"&&UUID.test(v[k] as string)))return null;
 if(!v.client||typeof v.client!=="object"||Array.isArray(v.client))return null;
 const c=v.client as Record<string,unknown>;
 const fields=["kind","document","name","tradeName","phone","whatsapp","email","postalCode","street","number","complement","city","region"];
 if(Object.keys(c).some(k=>!fields.includes(k))||!["individual","company"].includes(c.kind as string)||typeof c.document!=="string"||typeof c.name!=="string"||(c.whatsapp!=null&&typeof c.whatsapp!=="string")||typeof c.email!=="string")return null;
 if(!/^[A-Za-z0-9.\/-]+$/.test(c.document))return null;
 const individual=c.kind==="individual";
 if(individual&&!/^[0-9.-]+$/.test(c.document))return null;
 const document=individual?onlyDigits(c.document):normalizeCnpj(c.document);
 if(!(individual?isValidCpf(document):isValidCnpj(document)))return null;
 const patch=Object.fromEntries(Object.entries(c).filter(([k])=>!["kind","document","city","region"].includes(k)));
 const parsed=parseCadastroWriteCommand({operationId:v.operationId,tenantId:v.tenantId,advertiserId:v.advertiserId,actorId:v.actorId,canonicalClientId:v.advertiserId,expectedUpdatedAt:"2026-01-01T00:00:00Z",patch});
 if(!parsed||!parsed.patch.name||!parsed.patch.email||(individual&&parsed.patch.tradeName))return null;
 if([c.city,c.region].some(x=>x!=null&&(typeof x!=="string"||x.length>100||/[\u0000-\u001f\u007f]/.test(x))))return null;
 const city=typeof c.city==="string"?c.city.trim()||null:null;
 const region=typeof c.region==="string"?c.region.trim().toUpperCase()||null:null;
 if(Boolean(city)!==Boolean(region)||region&&!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(region))return null;
 const p=parsed.patch;
 return {operationId:parsed.operationId,tenantId:parsed.tenantId,advertiserId:parsed.advertiserId,actorId:parsed.actorId,client:{
  kind:individual?"individual":"company",status:"active",full_name:individual?p.name??null:null,company_name:individual?null:p.name??null,trade_name:individual?null:p.tradeName??null,
  cpf:individual?document:null,cnpj:individual?null:document,phone_primary:p.phone??null,whatsapp:p.whatsapp??null,email:p.email??null,
  address_zip:p.postalCode??null,address_street:p.street??null,address_number:p.number??null,address_complement:p.complement??null,address_city:city,address_state:region
 }};
}

export function parseCadastroLinkCommand(raw:unknown):{operationId:string;tenantId:string;advertiserId:string;actorId:string;document:string}|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).length!==6||v.mode!=="link_existing"||!["operationId","tenantId","advertiserId","actorId"].every(k=>typeof v[k]==="string"&&UUID.test(v[k] as string))||typeof v.document!=="string"||!/^(?:[0-9]{11}|[A-Z0-9]{12}[0-9]{2})$/.test(v.document))return null;
 if(!(v.document.length===11?isValidCpf(v.document):isValidCnpj(v.document)))return null;
 return {operationId:v.operationId as string,tenantId:v.tenantId as string,advertiserId:v.advertiserId as string,actorId:v.actorId as string,document:v.document};
}
