/** Mescla R2 + Drive + acervo PDF local sem apagar versões antigas.
 * Sempre preferir a fonte oficial R2 para números de edição conhecidos.
 * Sem número confiável, deduplicar somente pelo ID exato.
 */
export interface OnlineEditionRecord {
 id:string;title:string;dateLabel:string;category:string;pdfPath:string;
 editionNumber?:number;sourceUrl?:string;coverUrl?:string;pageCount?:number;
 archiveProvider?:string;
}
export function editionNumberForArchive(item:OnlineEditionRecord):number|undefined{
 if(Number.isInteger(item.editionNumber)&&Number(item.editionNumber)>0)
  return item.editionNumber;
 const match=/(?:edi[cç][aã]o|\bir)\s*(?:n[ºo.]\s*)?[-:#]?\s*(\d{3,4})(?!\d)/i.exec(item.title);
 return match?Number(match[1]):undefined;
}
export function mergeNewspaperEditions(
 official:OnlineEditionRecord[],drive:OnlineEditionRecord[],local:OnlineEditionRecord[],
):OnlineEditionRecord[]{
 const seen=new Map<string,OnlineEditionRecord>();
 for(const candidate of [...official,...drive,...local]){
  if(!candidate.id||!candidate.pdfPath)continue;
  const edition=editionNumberForArchive(candidate);
  const key=edition!==undefined?"edition:"+edition:"id:"+candidate.id;
  if(!seen.has(key))seen.set(key,candidate);
 }
 return [...seen.values()].sort((a,b)=>
  (editionNumberForArchive(b)??-1)-(editionNumberForArchive(a)??-1));
}
