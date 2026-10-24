import test from "node:test";
import assert from "node:assert/strict";
import {isDuplicateEditionUpload} from "../src/lib/editorial/editionUploadDedup";
const sha="A".repeat(64);
test("evita novo upload do mesmo PDF oficial com capa e SHA",()=>{
 const e={pdfSha256:sha.toLowerCase(),pdfR2Key:"jornal-online/2026/edicao-0770/file.pdf",coverUrl:"https://example.invalid/cover.webp"};
 assert.equal(isDuplicateEditionUpload(e,sha),true);
 assert.equal(isDuplicateEditionUpload(e,"b".repeat(64)),false);
});
test("permite completar arquivos antigos sem capa ou SHA",()=>{
 assert.equal(isDuplicateEditionUpload({pdfR2Key:"a",pdfSha256:sha},"a".repeat(64)),false);
 assert.equal(isDuplicateEditionUpload({coverUrl:"https://example.invalid/capa",pdfSha256:sha},sha),false);
 assert.equal(isDuplicateEditionUpload({pdfR2Key:"a",coverUrl:"b"},sha),false);
 assert.equal(isDuplicateEditionUpload(null,sha),false);
});
