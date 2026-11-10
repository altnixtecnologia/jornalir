/** Reordena somente posições, preservando objetos e responsáveis. */
export function reorderTaskItems<T>(items:readonly T[],from:number,to:number):T[]{
 const result=[...items];
 if(!Number.isInteger(from)||!Number.isInteger(to)||
  from<0||to<0||from>=items.length||to>=items.length||from===to)
   return result;
 const [selected]=result.splice(from,1);
 result.splice(to,0,selected);
 return result;
}
