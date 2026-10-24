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

test("não libera minuta se faltar identificação do cliente, venda ou valor",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"Documento: {{servicos.resumo}}.", reference:" ",clientName:"",
  totalPrice:"",document,
 });
 assert.deepEqual(result.missing,["cliente.nome","venda.referencia","venda.valor"]);
});
test("marcadores de outras sintaxes também bloqueiam a minuta",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"Valor {% venda.valor %}.",reference:"IR-200",
  clientName:"Cliente Teste",totalPrice:"R$ 275,00",document,
 });
 assert.deepEqual(result.missing,["marcadores inválidos no modelo"]);
});
test("valor informado no cadastro prevalece sobre substituição manual",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"{{cliente.nome}}",reference:"IR-200",clientName:"Cliente Autêntico",
  totalPrice:"R$ 275,00",document,values:{"cliente.nome":"Nome alterado"},
 });
 assert.match(result.text,/Cliente Autêntico/);
 assert.doesNotMatch(result.text,/Nome alterado/);
});

test("variáveis legais do cadastro mestre prevalecem sobre campos livres",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"{{cliente.nome}} | {{cliente.documento}} | {{cliente.endereco}}",
  reference:"IR-200",clientName:"Nome fantasia",totalPrice:"R$ 275,00",document,
  qualification:{"cliente.nome":"Razão Social Ltda.","cliente.documento":"11222333000181",
    "cliente.endereco":"Rua Principal, 12"},
  values:{"cliente.nome":"Falso","cliente.documento":"00000000000000"},
 });
 assert.deepEqual(result.missing,[]);
 assert.match(result.text,/Razão Social Ltda\. \| 11222333000181 \| Rua Principal, 12/);
 assert.doesNotMatch(result.text,/Falso|00000000000000/);
});

test("campo do modelo marcado obrigatório bloqueia mesmo se não estiver no texto",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"Contrato de prestação",reference:"IR-200",clientName:"Cliente",
  totalPrice:"R$ 275,00",document,
  requiredVariables:[{key:"prazo.pagamento",label:"Prazo de pagamento",required:true}],
 });
 assert.deepEqual(result.missing,["Prazo de pagamento"]);
});
test("campo obrigatório pode vir da qualificação, nunca de substituição manual",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"{{cliente.documento}}",reference:"IR-200",clientName:"Cliente",
  totalPrice:"R$ 275,00",document,
  qualification:{"cliente.documento":"12345678909"},
  values:{"cliente.documento":"00000000000"},
  requiredVariables:[{key:"cliente.documento",label:"CPF/CNPJ",required:true}],
 });
 assert.deepEqual(result.missing,[]);
 assert.match(result.text,/12345678909/);
 assert.doesNotMatch(result.text,/00000000000/);
});

test("instrumento final não repete os avisos de minuta",()=>{
 const result=renderCommercialLegalDraft({
  templateText:"Serviço aceito por {{cliente.nome}}. {{servicos.resumo}}",
  reference:"IR-300",clientName:"Empresa Ltda",totalPrice:"R$ 400,00",
  document:{title:"Contrato",text:"Entregas aprovadas, sem aviso de minuta"},
  final:true,
 });
 assert.deepEqual(result.missing,[]);
 assert.doesNotMatch(result.text,/NÃO ASSINAR|DOCUMENTO NÃO EMITIDO/);
 assert.match(result.text,/Empresa Ltda/);
});
