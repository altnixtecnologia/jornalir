import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(file:string)=>readFileSync(new URL(file,import.meta.url),"utf8");

test("Voltar aparece no cabeçalho preservando mini-cards Matérias",()=>{
 const header=read("../src/components/admin/ModuleHeader.tsx");
 assert.match(header,/import \{ ModuleBackButton \}/);
 assert.match(header,/<ModuleBackButton \/>/);
 assert.match(header,/module-header-middle/);
});
test("botão Voltar utiliza fallback seguro e não redireciona fora do sistema",()=>{
 const back=read("../src/components/admin/ModuleBackButton.tsx");
 assert.match(back,/ref\.origin===window\.location\.origin/);
 assert.match(back,/router\.push\(fallback\)/);
});
test("alça da Pauta foi alinhada sem mudar código de arraste",()=>{
 const css=read("../src/app/globals.css");
 assert.match(css,/\.module-eyebrow-row \.module-back-button/);
 assert.match(css,/\.is-pauta-workspace details\.pauta-item>\.workflow-collapsed-summary \.pauta-drag-grip/);
});
