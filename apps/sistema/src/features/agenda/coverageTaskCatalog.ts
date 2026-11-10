/** Catálogo editorial. As tarefas padrão têm rótulo estável, tarefas customizadas
 * são definidas apenas no evento e sempre atribuídas a uma pessoa.
 */
export const FIXED_COVERAGE_TASKS=[
  {kind:"photos",label:"Fotografias"},
  {kind:"video",label:"Vídeos"},
  {kind:"interviews",label:"Entrevistas"},
  {kind:"audio",label:"Captação de áudio"},
  {kind:"research",label:"Apuração de informações"},
  {kind:"live",label:"Transmissão ao vivo"},
  {kind:"media",label:"Seleção e envio de mídias"},
] as const;

export type CoverageTaskKind=(typeof FIXED_COVERAGE_TASKS)[number]["kind"]|"custom";
export type CoverageTaskDraft={kind:CoverageTaskKind;label:string};

export function validateCoverageTasks(input:unknown):CoverageTaskDraft[]|null{
 if(!Array.isArray(input)||input.length<1||input.length>8)return null;
 const found=new Set<string>();
 const output:CoverageTaskDraft[]=[];
 for(const entry of input){
  if(!entry||typeof entry!=="object")return null;
  const {kind,label}=entry as Record<string,unknown>;
  if(typeof kind!=="string"||typeof label!=="string")return null;
  const normalized=label.trim().replace(/\s+/g," ");
  if(normalized.length<2||normalized.length>80)return null;
  if(kind!=="custom"){
   const fixed=FIXED_COVERAGE_TASKS.find(t=>t.kind===kind);
   if(!fixed||fixed.label!==normalized)return null;
  }
  const key=normalized.toLocaleLowerCase("pt-BR");
  if(found.has(key))return null;
  found.add(key);
  output.push({kind:kind as CoverageTaskKind,label:normalized});
 }
 return output;
}
