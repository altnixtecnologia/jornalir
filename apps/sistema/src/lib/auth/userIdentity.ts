/** Padrão de cadastro: nome informado pela pessoa, nunca derivado do e-mail. */
export function normalizeStaffName(input:string):string|null {
 const name=input.trim().replace(/\s+/g," ");
 if(name.length<3||name.length>120||!/[\p{L}]/u.test(name)||name.includes("@")) return null;
 return name;
}
export function hasRealStaffName(name:string|null|undefined,email:string|null|undefined):boolean {
 const clean=normalizeStaffName(name??"");
 if(!clean) return false;
 const emailPrefix=(email??"").trim().split("@")[0]?.toLowerCase()??"";
 // Perfis antigos criados automaticamente a partir do trecho antes do @
 // precisam ser revisados. Não inventar nome nem alterar essas linhas.
 return !emailPrefix||clean.toLowerCase()!==emailPrefix;
}
export function staffNameLabel(name:string|null|undefined,email:string|null|undefined):string {
 return hasRealStaffName(name,email)?name!.trim().replace(/\s+/g," "):"Nome não informado";
}
