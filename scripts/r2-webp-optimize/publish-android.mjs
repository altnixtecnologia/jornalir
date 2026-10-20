#!/usr/bin/env node
// Jornal IR: release Android via R2 + Supabase, somente com APK release já assinado.
import { readFile, stat, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_CERT="4710157434aba17d3e1b34cf5851af65b89d0895041999e6b40d0a3487066d20";
const EXPECTED_PROJECT="iqnzrpdccecgalqboeyf";
const EXPECTED_BUCKET="jornalir-media";
const EXPECTED_PUBLIC="https://pub-3d61ff8f7b474fcdbaa936f006ba2bf4.r2.dev";
const PACKAGE="com.jornalir";
const args=process.argv.slice(2);
const arg=(k)=>args.find(v=>v.startsWith(k+"="))?.slice(k.length+1);
const apk=arg("--apk");
const version=arg("--version")||"v.00.03";
const versionCode=Number(arg("--code")||"4");
const commit=args.includes("--commit");
function fail(message){throw new Error(message);}
if(args.includes("--help")||!apk){
  console.log("Uso: node --env-file=.env.local publish-android.mjs --apk=CAMINHO_APK --version=v.00.03 --code=4 [--commit]");
  console.log("Sem --commit: somente valida. Com --commit: publica no R2 e libera o download no Supabase.");
  process.exit(args.includes("--help")?0:2);
}
if(!/^v\.[0-9]{2}\.[0-9]{2}$/.test(version)||!Number.isInteger(versionCode)||versionCode<4)fail("Versão ou código inválido.");
function hash(b){return createHash("sha256").update(b).digest("hex");}
function envRequired(names){
  const missing=names.filter(n=>!process.env[n]);
  if(missing.length)fail("Variáveis locais ausentes: "+missing.join(", ")+". Nada publicado.");
}
async function buildTool(name) {
  const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
  if(!sdk)return name; // ferramenta instalada no PATH
  const dir=join(sdk,"build-tools");
  let folders=[];
  try{folders=(await readdir(dir)).filter(x=>/^[0-9]+(\.[0-9]+)+$/.test(x)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));}catch{}
  if(!folders.length)return name;
  return join(dir,folders[0],name+(process.platform==="win32"?".exe":""));
}
function run(name,binary,parameters){
  try{return execFileSync(binary,parameters,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:120000});}
  catch(e){fail("Validação Android "+name+" falhou: "+(e?.stderr?.toString()?.slice(0,500)||"ferramenta ausente ou erro de assinatura"));}
}
async function publicCheck(url,size,sha){
  const head=await fetch(url,{method:"HEAD",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(!head.ok)fail("R2 público não respondeu HEAD 200: "+head.status);
  const len=Number(head.headers.get("content-length")||0);
  if(len&&len!==size)fail("Tamanho remoto divergente.");
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(90000)});
  if(!response.ok)fail("Download público falhou: "+response.status);
  const buf=Buffer.from(await response.arrayBuffer());
  if(buf.length!==size||hash(buf)!==sha)fail("SHA-256 do APK público divergente!");
}
async function runRelease(){
  const path=resolve(apk);
  const fileInfo=await stat(path);
  if(!fileInfo.isFile()||fileInfo.size<100000||fileInfo.size>200*1024*1024)fail("APK inexistente ou tamanho suspeito.");
  const buffer=await readFile(path);
  if(buffer.subarray(0,2).toString()!=="PK")fail("Arquivo informado não parece APK.");
  const sha=hash(buffer);
  const [aapt,apksigner,zipalign]=await Promise.all(["aapt","apksigner","zipalign"].map(buildTool));
  const dump=run("aapt",aapt,["dump","badging",path]);
  const info=dump.match(/package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'/);
  if(!info||info[1]!==PACKAGE||Number(info[2])!==versionCode||info[3]!==version)
    fail("Identificador, versionCode ou versionName do APK incorretos.");
  const signature=run("apksigner",apksigner,["verify","--print-certs",path]);
  const signHash=signature.match(/Signer #1 certificate SHA-256 digest:\s*([0-9a-f:]+)/i)?.[1]?.replace(/:/g,"").toLowerCase();
  if(signHash!==EXPECTED_CERT)fail("CERTIFICADO DIFERENTE DA v.00.02: não pode atualizar celulares instalados.");
  run("zipalign",zipalign,["-c","-v","4",path]);
  const key="aplicativos/android/jornal-ir-"+version+".apk";
  console.log("APK OK: "+PACKAGE+" / "+version+" / code "+versionCode);
  console.log("Assinatura original OK. Bytes="+buffer.length+" SHA-256="+sha);
  if(!commit){console.log("Somente validação. Para publicar após testes Android, use --commit.");return;}
  envRequired(["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_ENDPOINT","R2_BUCKET","R2_PUBLIC_BASE_URL"]);
  const supabaseUrl=new URL(process.env.SUPABASE_URL);
  if(supabaseUrl.hostname!==EXPECTED_PROJECT+".supabase.co")fail("Supabase incorreto.");
  if(process.env.R2_BUCKET!==EXPECTED_BUCKET)fail("Bucket R2 incorreto.");
  const base=new URL(process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/,""));
  if(base.origin!==EXPECTED_PUBLIC||base.pathname!=="/"||base.search||base.hash)fail("URL pública R2 incorreta.");
  const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:previous,error:previousError}=await sb.from("mobile_app_releases").select("version_code,published,apk_sha256").eq("platform","android").single();
  if(previousError||!previous)fail("Tabela de releases indisponível no Supabase.");
  if(previous.version_code>versionCode||(previous.published&&previous.version_code===versionCode&&previous.apk_sha256!==sha))
    fail("Versão já publicada mais nova ou hash diferente. Nada foi sobrescrito.");
  const client=new S3Client({region:"auto",endpoint:process.env.R2_ENDPOINT,credentials:{
    accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY,
  }});
  let exists=false;
  try{
    const head=await client.send(new HeadObjectCommand({Bucket:EXPECTED_BUCKET,Key:key}));
    exists=true;
    if(Number(head.ContentLength)!==buffer.length)fail("Objeto R2 com mesmo nome, mas tamanho diferente.");
  }catch(e){
    if(!["NotFound","NoSuchKey"].includes(e.name)&&e.$metadata?.httpStatusCode!==404)throw e;
  }
  if(exists){
    const object=await client.send(new GetObjectCommand({Bucket:EXPECTED_BUCKET,Key:key}));
    const existing=Buffer.from(await object.Body.transformToByteArray());
    if(hash(existing)!==sha)fail("Já existe APK com conteúdo diferente sob esta versão. Sem sobrescrever.");
  }else{
    await client.send(new PutObjectCommand({
      Bucket:EXPECTED_BUCKET,Key:key,Body:buffer,
      ContentType:"application/vnd.android.package-archive",
      ContentDisposition:'attachment; filename="jornal-ir-'+version+'.apk"',
      IfNoneMatch:"*",
    }));
  }
  const url=EXPECTED_PUBLIC+"/"+key;
  let verified=false, last;
  for(let attempt=0;attempt<5;attempt++){
    try{await publicCheck(url,buffer.length,sha);verified=true;break;}
    catch(e){last=e;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
  }
  if(!verified)fail("APK no R2, mas URL pública não validada: "+last?.message+". Banco não liberado.");
  const {data:published,error:publishError}=await sb.from("mobile_app_releases")
    .update({version_label:version,version_code:versionCode,published:true,apk_url:url,
      apk_sha256:sha,apk_size_bytes:buffer.length,
      release_notes:"Correção do botão Voltar, navegação e confirmação de saída no Android.",
      published_at:new Date().toISOString()})
    .eq("platform","android").lte("version_code",versionCode)
    .select("version_label,version_code,published,apk_sha256").single();
  if(publishError||!published?.published||published.apk_sha256!==sha)
    fail("Arquivo validado no R2, mas cadastro não publicado no Supabase: "+(publishError?.message||"erro de concorrência"));
  const site=await fetch("https://jornalir.vercel.app/aplicativo",{cache:"no-store",signal:AbortSignal.timeout(20000)});
  const html=site.ok?await site.text():"";
  if(!site.ok||!html.includes("Baixar aplicativo para Android")||!html.includes(version))
    fail("Registro publicado, mas site não mostra o botão; verificar página/RLS antes de divulgar.");
  console.log("RELEASE PUBLICADA E CONFERIDA: https://jornalir.vercel.app/aplicativo");
  console.log("APK: "+url);
  console.log("SHA-256: "+sha);
}
runRelease().catch(e=>{console.error("ERRO: "+e.message);process.exitCode=1;});
