import test from "node:test";
import assert from "node:assert/strict";
import { buildCommercialContractPreview, type CommercialPreviewInput } from "../src/lib/contracts/commercialContractPreview";

const sample: CommercialPreviewInput = {
  reference: "VENDA-01", clientName: "Cliente de testes", amount: 475, mode: "combined",
  services: [
    {
      item_ordinal: 1, service_title: "Publicidade LED", service_channel: "led_panel",
      source_snapshot: { totalAmount: 275, quantity: 1 },
      starts_on: "2026-11-01", ends_on: "2026-11-30", service_location: "Praça",
      service_scope: "Exibição LED", execution_conditions: "",
    },
    {
      item_ordinal: 0, service_title: "Locação de projetor", service_channel: "equipment_rental",
      source_snapshot: { totalAmount: 200, quantity: 2 },
      starts_on: "2026-11-05", ends_on: "2026-11-09", service_location: "Salão",
      service_scope: "Projetor e controle", execution_conditions: "Devolver até 18h",
    },
  ],
};

test("documento combinado lista todos os itens e valor total original", () => {
  const result = buildCommercialContractPreview(sample);
  assert.equal(result.documents.length, 1);
  assert.equal(result.missing.length, 0);
  const document = result.documents[0].text;
  assert.match(document, /R\$\s*475,00/);
  assert.ok(document.indexOf("LOCAÇÃO DE PROJETOR") < document.indexOf("PUBLICIDADE LED"));
  assert.match(document, /MINUTA DE CONFERÊNCIA/);
  assert.match(document, /NÃO ASSINAR/);
  assert.match(document, /05\/11\/2026/);
});

test("documentos separados mantêm condições e valores dos itens", () => {
  const result = buildCommercialContractPreview({ ...sample, mode: "separate" });
  assert.equal(result.documents.length, 2);
  assert.match(result.documents[0].text, /R\$\s*200,00/);
  assert.match(result.documents[1].text, /R\$\s*275,00/);
  assert.doesNotMatch(result.documents[0].text, /Valor TOTAL da venda/);
});

test("não supõe prazos nem objeto ausentes e exige local de LED", () => {
  const incomplete = { ...sample, services: [
    { ...sample.services[0], starts_on: null, ends_on: null, service_location: "", service_scope: "" },
  ] };
  const result = buildCommercialContractPreview(incomplete);
  assert.deepEqual(result.missing.length, 4);
  assert.match(result.documents[0].text, /PENDENTE/);
  assert.match(result.documents[0].text, /A CONFIRMAR/);
});

test("documento sem serviços não é dado como pronto", () => {
  const result = buildCommercialContractPreview({ ...sample, services: [] });
  assert.deepEqual(result.missing, ["Serviços contratados"]);
  assert.equal(result.documents.length, 0);
});

test("valor de item ausente impede liberação da minuta", () => {
  const broken = { ...sample, services: [
    { ...sample.services[0], source_snapshot: { quantity: 1 } },
  ] };
  const result = buildCommercialContractPreview(broken);
  assert.ok(result.missing.some(value => value.includes("valor negociado")));
});

test("valor total inválido impede liberação da minuta", () => {
  const result = buildCommercialContractPreview({ ...sample, amount: Number.NaN });
  assert.ok(result.missing.includes("Valor total da venda"));
});

test("anexo jurídico final mantém valores e não imprime avisos da conferência",()=>{
 const result=buildCommercialContractPreview(sample,{forLegalInstrument:true});
 assert.equal(result.documents.length,1);
 assert.doesNotMatch(result.documents[0].text,/NÃO ASSINAR|MINUTA DE CONFERÊNCIA/);
 assert.match(result.documents[0].text,/R\\$\\s*475,00/);
});
