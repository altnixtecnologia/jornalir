import test from "node:test";
import assert from "node:assert/strict";
import {isEditionDirectUploadPair} from "../src/lib/editorial/editionDirectUploadKeys";
const id="123e4567-e89b-42d3-a456-426614174000",base="jornal-online/2026/edicao-0769/";
test("somente PDF e capa do mesmo upload UUID da mesma edição",()=>{
 assert.equal(isEditionDirectUploadPair(base+id+"-informativo-regional.pdf",
   base+"capa-"+id+".webp",769,"2026-10-24"),true);
});
test("não apagar versões existentes, outra edição ou caminhos arbitrários",()=>{
 for(const [pdf,cover] of [
  [base+"hash-edicao.pdf",base+"capa-"+id+".webp"],
  [base+id+"-informativo-regional.pdf",base+"capa-123e4567-e89b-42d3-a456-426614174001.webp"],
  [base+id+"-informativo-regional.pdf","jornal-online/2025/edicao-0769/capa-"+id+".webp"],
  [base+"../../segredo.pdf",base+"capa-"+id+".webp"],
  [base+id+"-informativo-regional.pdf",base+"capa-"+id+".jpg"],
 ]) assert.equal(isEditionDirectUploadPair(pdf,cover,769,"2026-10-24"),false);
});
