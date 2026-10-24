/** Regras editoriais de veiculação para uma imagem patrocinada do portal.
 * NÃO consultam títulos ou Altnix Informativo: a suspensão financeira exige
 * contrato/veiculação explicitamente vinculados numa integração futura.
 */
export interface SiteAdPublicationInput {
  active: boolean;
  activeFrom: string | null;
  activeUntil: string | null;
}
function normalizeDate(value: string | null): string | undefined {
  const raw=(value??"").trim();
  if(!raw)return undefined;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw new Error("Informe uma data válida (AAAA-MM-DD).");
  const date=new Date(raw+"T12:00:00Z");
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==raw)throw new Error("Data de veiculação inválida.");
  return raw;
}
export function validateSiteAdPublication(input: SiteAdPublicationInput):{
  active:boolean;
  activeFrom?:string;
  activeUntil?:string;
}{
  if(typeof input?.active!=="boolean")throw new Error("Situação do anúncio inválida.");
  const activeFrom=normalizeDate(input.activeFrom);
  const activeUntil=normalizeDate(input.activeUntil);
  if(activeFrom&&activeUntil&&activeUntil<activeFrom)throw new Error("A data final não pode ser anterior à inicial.");
  return {active:input.active,activeFrom,activeUntil};
}
export function publicationStatus(
 input:{active:boolean;activeFrom?:string;activeUntil?:string},
 todayISO:string,
):"suspended"|"scheduled"|"expired"|"active"{
 if(!input.active)return "suspended";
 if(input.activeFrom&&todayISO<input.activeFrom)return "scheduled";
 if(input.activeUntil&&todayISO>input.activeUntil)return "expired";
 return "active";
}
