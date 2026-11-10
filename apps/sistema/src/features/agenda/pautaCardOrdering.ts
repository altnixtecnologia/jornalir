/** Ordenação de cartões da Pauta por arrastar o cartão inteiro.
 * Não altera o array original, nem cria ou remove registros. */
export function movePautaCardIds(
  ids:readonly string[],sourceId:string,targetId:string
):string[]|null{
  const from=ids.indexOf(sourceId),to=ids.indexOf(targetId);
  if(from<0||to<0||from===to)return null;
  const next=[...ids];
  next.splice(from,1);
  next.splice(to,0,sourceId);
  return next;
}
