import test from "node:test";
import assert from "node:assert/strict";
import { renderCommercialLegalDraft } from "../src/lib/contracts/commercialLegalDraft";
const document = {title:"Serviço LED",text:"Serviço LED; 01/11/2026 a 30/11/2026; R$ 275,00"};
test("interpolação autorizada usa dados da venda e mantém aviso não assinável",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"Contratante {{cliente.nome}}. Venda {{venda.referencia}}. {{servicos.resumo}}.",
  reference:"IR-200",clientName:"Cliente Teste",totalPrice:"R$ 275,00",document,
 });
 assert.deepEqual(result.missing,[]);
 assert.match(result.text,/Cliente Teste/);
 assert.match(result.text,/IR-200/);
 assert.match(result.text,/NÃO ASSINAR/);
});
test("não preenche cláusula ou variável que não foi fornecida",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"Prazo {{prazo.pessoal}} e multa {{multa.percentual}}.",
  reference:"IR-200",clientName:"Cliente Teste",totalPrice:"R$ 275,00",document,
 });
 assert.deepEqual(result.missing,["prazo.pessoal","multa.percentual"]);
 assert.doesNotMatch(result.text, /undefined|null|NaN/);
});
test("variáveis extras são somente texto literal, sem avaliação",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"Cláusula {{observacao}}.",reference:"IR-200",clientName:"Cliente Teste",
  totalPrice:"R$ 275,00",document,values:{observacao:"2+2; <script>alert(1)</script>"},
 });
 assert.deepEqual(result.missing,[]);
 assert.match(result.text, /2\+2; <script>alert\(1\)<\/script>/);
});
test("marcadores malformados bloqueiam PDF",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"Campo {{qualquer chave}}.",reference:"IR-200",
  clientName:"Cliente Teste",totalPrice:"R$ 275,00",document,
 });
 assert.deepEqual(result.missing,["marcadores inválidos no modelo"]);
});
