import "server-only";
import {createSign} from "node:crypto";
import {audienceDateRange,parseAudienceReports,type AudienceData,type AudiencePeriod,type GaReport} from "./ga4Report";

export type AudienceLoadResult =
  | {status:"not_configured";message:string}
  | {status:"unavailable";message:string}
  | {status:"ready";data:AudienceData};

const cachedReports=new Map<AudiencePeriod,{expires:number;data:AudienceData}>();
let tokenCache:{value:string;expires:number}|undefined;

function todayInBrazil():string {
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(new Date());
  const part=(type:string)=>parts.find(item=>item.type===type)?.value??"";
  return part("year")+"-"+part("month")+"-"+part("day");
}
function encodedJson(value:unknown):string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
async function getGoogleToken(email:string,privateKey:string):Promise<string> {
  if(tokenCache && tokenCache.expires>Date.now()+60000) return tokenCache.value;
  const now=Math.floor(Date.now()/1000);
  const jwtHeader=encodedJson({alg:"RS256",typ:"JWT"});
  const jwtPayload=encodedJson({
    iss:email,scope:"https://www.googleapis.com/auth/analytics.readonly",
    aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3500,
  });
  const assertion=jwtHeader+"."+jwtPayload;
  const signer=createSign("RSA-SHA256");
  signer.update(assertion);signer.end();
  const signature=signer.sign(privateKey.replace(/\\n/g,"\n")).toString("base64url");
  const body=new URLSearchParams({
    grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:assertion+"."+signature,
  });
  const response=await fetch("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body,cache:"no-store",signal:AbortSignal.timeout(9000),
  });
  if(!response.ok) throw new Error("authentication");
  const token=await response.json() as {access_token?:string;expires_in?:number};
  if(!token.access_token) throw new Error("authentication");
  tokenCache={value:token.access_token,expires:Date.now()+Math.min(3500,token.expires_in??3000)*1000};
  return token.access_token;
}
function reportsRequest(period:AudiencePeriod):object {
  const dateRanges=[audienceDateRange(period,todayInBrazil())];
  const report=(extra:Record<string,unknown>)=>({dateRanges,...extra});
  const views={name:"screenPageViews"};
  const users={name:"activeUsers"};
  return {reports:[
    report({metrics:[views,users,{name:"sessions"}],limit:"1"}),
    report({dimensions:[{name:"date"}],metrics:[views],orderBys:[{dimension:{dimensionName:"date"}}],limit:"31"}),
    report({dimensions:[{name:"hour"}],metrics:[views],orderBys:[{dimension:{dimensionName:"hour"}}],limit:"24"}),
    report({dimensions:[{name:"country"},{name:"region"},{name:"city"}],metrics:[users],
      orderBys:[{metric:{metricName:"activeUsers"},desc:true}],limit:"12"}),
    report({dimensions:[{name:"pagePath"},{name:"pageTitle"}],metrics:[views],
      dimensionFilter:{filter:{fieldName:"pagePath",stringFilter:{matchType:"BEGINS_WITH",value:"/noticias/"}}},
      orderBys:[{metric:{metricName:"screenPageViews"},desc:true}],limit:"100"}),
  ]};
}
export async function getAudienceData(period:AudiencePeriod):Promise<AudienceLoadResult> {
  const property=process.env.GA4_PROPERTY_ID?.trim();
  const email=process.env.GA4_CLIENT_EMAIL?.trim();
  const privateKey=process.env.GA4_PRIVATE_KEY;
  if(!property||!/^[0-9]{5,15}$/.test(property)||!email||!privateKey)
    return {status:"not_configured",message:"Conecte a propriedade do Google Analytics 4 ao Jornal IR para consultar visitas e matérias mais lidas."};
  const hit=cachedReports.get(period);
  if(hit && hit.expires>Date.now())return {status:"ready",data:hit.data};
  try {
    const accessToken=await getGoogleToken(email,privateKey);
    const response=await fetch("https://analyticsdata.googleapis.com/v1beta/properties/"+property+":batchRunReports",{
      method:"POST",headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
      body:JSON.stringify(reportsRequest(period)),cache:"no-store",signal:AbortSignal.timeout(14000),
    });
    if(!response.ok) {
      console.error("GA4 consulta indisponível, HTTP",response.status);
      return {status:"unavailable",message:"Não foi possível consultar o Analytics. Confira as permissões da propriedade e a configuração da API."};
    }
    const payload=await response.json() as {reports?:GaReport[]};
    if(!Array.isArray(payload.reports)||payload.reports.length!==5)
      return {status:"unavailable",message:"O Analytics retornou um relatório incompleto. Tente novamente."};
    const data=parseAudienceReports(payload.reports);
    cachedReports.set(period,{data,expires:Date.now()+5*60*1000});
    return {status:"ready",data};
  }catch {
    return {status:"unavailable",message:"A conexão com o Analytics está temporariamente indisponível. Verifique a configuração no servidor."};
  }
}
