import test from "node:test";
import assert from "node:assert/strict";
import {mergeNewspaperEditions,editionNumberForArchive,type OnlineEditionRecord}
 from "../src/lib/public/jornalOnlineEditionMerge";

function item(id:string,title:string,editionNumber?:number):OnlineEditionRecord{
 return {id,title,editionNumber,category:"Edição Semanal",dateLabel:"Acervo",pdfPath:"/pdf/"+id};
}
test("R2 primeiro; Drive e PDFs locais permanecem mesmo com edição oficial",()=>{
 const official=[item("r2-770","Informativo Regional",770)];
 const drive=[item("drive-771","Informativo Regional - IR 771"),item("drive-770","Informativo Regional - IR 770")];
 const local=[item("ir-700","Informativo Regional - Edição 700"),item("ir-699","Informativo Regional - Edição 699")];
 const result=mergeNewspaperEditions(official,drive,local);
 assert.deepEqual(result.map(x=>x.id),["drive-771","r2-770","ir-700","ir-699"]);
});
test("não juntar acervos distintos por número de ano ou título genérico",()=>{
 const one=item("a","Acervo antigo de 2026");
 const two=item("b","Acervo antigo de 2026");
 assert.equal(editionNumberForArchive(one),undefined);
 assert.deepEqual(mergeNewspaperEditions([], [one,two],[]).map(x=>x.id),["a","b"]);
});
test("duplica ID não; R2 tem prioridade sobre legado",()=>{
 const r2=item("r2-700","Edição 700",700);
 const result=mergeNewspaperEditions([r2],[item("drive-700","Edição 700")],
  [item("ir-700","Edição 700"),item("ir-700","Edição 700")]);
 assert.deepEqual(result.map(x=>x.id),["r2-700"]);
});
