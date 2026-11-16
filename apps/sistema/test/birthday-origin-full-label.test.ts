import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src=(path:string)=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");

test("origem/vínculo mostra por extenso o nome do cliente, sem recortar no modal",()=>{
  const form=src("features/aniversariantes/BirthdaysList.tsx");
  const css=src("features/aniversariantes/BirthdaysList.module.css");
  const pos=form.indexOf('>Origem / vínculo</span>');
  assert.ok(pos>=0);
  const snippet=form.slice(pos-105,pos+1200);
  assert.match(snippet,/cadastro-field--span-9/);
  assert.match(snippet,/styles\.originFullLabel/);
  assert.match(snippet,/groups\.find\(\(g\) => g\.id === linkGroupId\)\?\.label/);
  assert.match(snippet,/Vinculado a:/);
  assert.match(css,/\.originFullLabel/);
  assert.match(css,/white-space: normal/);
  assert.match(css,/overflow-wrap: anywhere/);
  assert.match(form.slice(pos+300,pos+1550),/Relação \/ parentesco/);
});
