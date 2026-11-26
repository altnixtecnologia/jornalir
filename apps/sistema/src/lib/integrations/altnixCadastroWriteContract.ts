import { onlyDigits } from "@ir/core";

/** Release independente da leitura. Nenhum env libera sozinho uma escrita. */
export const ALTNIX_CADASTRO_WRITE_RELEASED = false as boolean;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = ["name","tradeName","phone","whatsapp","email","postalCode","street","number","complement"] as const;
type Field = typeof FIELDS[number];
export type CadastroWriteCommand = {
  operationId:string; tenantId:string; advertiserId:string; actorId:string; canonicalClientId:string;
  expectedUpdatedAt:string; patch:Partial<Record<Field,string|null>>;
};
const keys = ["operationId","tenantId","advertiserId","actorId","canonicalClientId","expectedUpdatedAt","patch"];
const isObject=(v:unknown):v is Record<string,unknown> => Boolean(v && typeof v==="object" && !Array.isArray(v));

/** Edição de cliente vinculado. CPF/CNPJ, tipo, cidade/UF (IBGE fiscal),
 * papéis, status, pessoas relacionadas e demais dados exclusivos não são
 * alterados por este comando. Cadastro novo terá contrato próprio. */
export function parseCadastroWriteCommand(raw:unknown):CadastroWriteCommand|null {
  if(!isObject(raw)||Object.keys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)))return null;
  for(const k of keys.slice(0,5))if(typeof raw[k]!=="string"||!UUID.test(raw[k] as string))return null;
  if(typeof raw.expectedUpdatedAt!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(raw.expectedUpdatedAt)||!Number.isFinite(Date.parse(raw.expectedUpdatedAt)))return null;
  if(!isObject(raw.patch)||!Object.keys(raw.patch).length||Object.keys(raw.patch).some(k=>!FIELDS.includes(k as Field)))return null;
  const patch:CadastroWriteCommand["patch"]={};
  for(const key of FIELDS){
    if(!Object.hasOwn(raw.patch,key))continue;
    const value=raw.patch[key];
    if(value!==null&&typeof value!=="string")return null;
    if(typeof value==="string"&&(value.length>300||/[\u0000-\u001f\u007f]/.test(value)))return null;
    let normalized=typeof value==="string"?value.trim()||null:null;
    if(key==="name"&&!normalized)return null;
    if(key==="whatsapp"||key==="phone"){
      if(normalized){
        if(!/^[+\d().\s-]+$/.test(normalized))return null;
        normalized=onlyDigits(normalized);
        if(!/^(?:\d{10,11}|55\d{10,11})$/.test(normalized))return null;
        if(normalized.length>11)normalized=normalized.slice(2);
      }else if(key==="whatsapp")return null;
    }
    if(key==="email"){
      if(!normalized||!/^\S+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.split("@").length!==2)return null;
      normalized=normalized.toLowerCase();
    }
    if(key==="postalCode"&&normalized){
      if(!/^\d{5}-?\d{3}$/.test(normalized))return null;
      normalized=onlyDigits(normalized);
    }
    patch[key]=normalized;
  }
  return {operationId:raw.operationId as string,tenantId:raw.tenantId as string,advertiserId:raw.advertiserId as string,actorId:raw.actorId as string,canonicalClientId:raw.canonicalClientId as string,expectedUpdatedAt:raw.expectedUpdatedAt,patch};
}
