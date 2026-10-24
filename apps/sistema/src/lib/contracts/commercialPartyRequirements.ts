/** Requisitos mínimos de identificação jurídica dos dois polos contratuais. */
export const CONTRACTOR_FIELDS = [
  "contratada.razao_social",
  "contratada.cnpj",
  "contratada.endereco",
  "contratada.representante",
] as const;

export function missingCommercialLegalParties(
  content:string,
  declaredKeys:readonly string[],
):string[] {
  const declared=new Set(declaredKeys);
  const missing:string[]=[];
  for(const key of CONTRACTOR_FIELDS) {
    if(!declared.has(key)) missing.push("Declarar "+key);
    if(!content.includes("{{"+key+"}}")) missing.push("Inserir "+key+" no texto");
  }
  const clientQualification=content.includes("{{cliente.qualificacao}}")
    || ["cliente.nome","cliente.documento","cliente.endereco"].every(key=>
      content.includes("{{"+key+"}}")
    );
  if(!clientQualification) {
    missing.push("Qualificação completa do cliente no texto (cliente.qualificacao)");
  }
  return missing;
}
