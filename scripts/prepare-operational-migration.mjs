import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Gera exclusivamente um arquivo local via CLI; não faz link, push,
// reset, deploy, conexão remota ou alteração de dados.
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const name="altnix_service_operational_authorization";
const candidate="tests/security/fixtures/altnix-service-outbox-candidate.sql";
const sandbox="tests/security/altnix-service-outbox-sandbox.sql";
const generatedSandbox="tests/security/.generated-operational-migration-sandbox.sql";
const migrationDir=join(root,"supabase","migrations");
const args=process.argv.slice(2);
if(!args.includes("--generate")||args.some(a=>!["--generate","--sandbox-copy"].includes(a)))throw new Error("Uso: node scripts/prepare-operational-migration.mjs --generate [--sandbox-copy]");
const existing=readdirSync(migrationDir).filter(f=>f.endsWith("_"+name+".sql"));
if(existing.length>1)throw new Error("Mais de uma migration operacional: resolver manualmente.");
const source=readFileSync(join(root,candidate),"utf8");
if(!source.startsWith("-- ")||!source.includes("NÃO É MIGRATION."))throw new Error("Candidato inesperado.");
const hash=createHash("sha256").update(source).digest("hex");
const body="-- Migration operacional gerada do candidato validado; ativação separada.\n-- SHA256 do candidato: "+hash+"\n"+source.slice(source.indexOf("\n")+1);
let filename=existing[0];
if(filename){
 // CI também deve aceitar a migration já versionada, mas não sobrescrever
 // SQL aplicado ou divergente. Alterações futuras exigem migration nova.
 if(readFileSync(join(migrationDir,filename),"utf8")!==body)throw new Error("Migration existente difere do candidato; não sobrescrever.");
}else{
 const before=new Set(readdirSync(migrationDir));
 process.stderr.write(execFileSync("supabase",["--version"],{cwd:root,encoding:"utf8"}));
 process.stderr.write(execFileSync("supabase",["migration","new",name],{cwd:root,encoding:"utf8"}));
 const created=readdirSync(migrationDir).filter(f=>!before.has(f)&&/^\d{14}_[a-z0-9_]+\.sql$/.test(f)&&f.endsWith("_"+name+".sql"));
 if(created.length!==1)throw new Error("CLI não gerou exatamente uma migration.");
 filename=created[0];
 const target=join(migrationDir,filename);
 if(readFileSync(target,"utf8").trim()!=="")throw new Error("Arquivo gerado não está vazio; não sobrescrever.");
 writeFileSync(target,body,"utf8");
}
const relative="supabase/migrations/"+filename;
if(args.includes("--sandbox-copy")){
 const original=readFileSync(join(root,sandbox),"utf8");
 const include="\\ir fixtures/"+candidate.split("/").at(-1);
 if(original.split(include).length!==2)throw new Error("Include de sandbox inesperado.");
 const target=join(root,generatedSandbox);
 if(existsSync(target))throw new Error("Sandbox gerado já existe.");
 writeFileSync(target,original.replace(include,"\\ir ../../"+relative),"utf8");
}
console.log(relative);
