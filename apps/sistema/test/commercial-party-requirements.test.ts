import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACTOR_FIELDS,missingCommercialLegalParties,
} from "../src/lib/contracts/commercialPartyRequirements";

const complete=[
  ...CONTRACTOR_FIELDS.map(key=>"{{"+key+"}}"),
  "{{cliente.qualificacao}}",
].join("\n");
test("modelo completo identifica contratada e cliente",()=>{
 assert.deepEqual(missingCommercialLegalParties(complete,[...CONTRACTOR_FIELDS]),[]);
});
test("apenas declarar os campos não equivale a incluí-los no contrato",()=>{
 const missing=missingCommercialLegalParties("Contrato {{cliente.nome}}.",[...CONTRACTOR_FIELDS]);
 assert.ok(missing.some(line=>line.includes("Inserir contratada.cnpj")));
 assert.ok(missing.some(line=>line.includes("cliente.qualificacao")));
});
test("qualificação do cliente pode usar campos separados completos",()=>{
 const text=CONTRACTOR_FIELDS.map(k=>"{{"+k+"}}").join(" ")+" "+
   "{{cliente.nome}} {{cliente.documento}} {{cliente.endereco}}";
 assert.deepEqual(missingCommercialLegalParties(text,[...CONTRACTOR_FIELDS]),[]);
});
test("campos da contratada omitidos na declaração impedem emissão",()=>{
 const missing=missingCommercialLegalParties(complete,["contratada.cnpj"]);
 assert.ok(missing.includes("Declarar contratada.razao_social"));
});
