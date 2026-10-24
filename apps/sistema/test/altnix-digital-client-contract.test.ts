import test from "node:test";
import assert from "node:assert/strict";
import { ALTNIX_CLIENT_EXPORT_RELEASED, toAltnixDigitalClient, sanitizeDigitalClientSearch } from "../src/lib/integrations/altnixDigitalClientContract";

const data = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "company" as const, status: "active" as const,
  full_name: null, company_name: "Empresa Teste Ltda", trade_name: "Teste",
  cpf: null, cnpj: "11222333000181", phone_primary: "48999990000", email: "a@example.test",
  address_zip: "88900000", address_street: "Rua Teste", address_number: "10",
  address_complement: null, address_city: "São João do Sul", address_state: "SC",
  updated_at: "2026-10-24T12:00:00Z",
};
test("mestre exporta apenas cadastro comum, nunca dados financeiros ou privados", () => {
  const row = {...data, notes: "NÃO EXPORTAR", asaas_customer_id: "secret",
    payment_status: "overdue", contract_id: "financeiro", birth_date: "1995-01-01" };
  assert.deepEqual(toAltnixDigitalClient(row), {
    masterClientId: data.id, name: data.company_name, tradeName: "Teste",
    document: data.cnpj, phone: data.phone_primary, email: data.email,
    postalCode: data.address_zip, street: data.address_street,
    number: data.address_number, complement: null,
    city: data.address_city, region: data.address_state, updatedAt: data.updated_at,
  });
});
test("cadastro inativo ou identidade sem nome não pode sair", () => {
  assert.equal(toAltnixDigitalClient({...data,status:"inactive"}),null);
  assert.equal(toAltnixDigitalClient({...data,company_name:null}),null);
});
test("pessoa física nunca vaza identificadores de empresa", () => {
  const row=toAltnixDigitalClient({...data,kind:"individual",full_name:"Nome Pessoa",cpf:"11122233396"});
  assert.equal(row?.name,"Nome Pessoa");
  assert.equal(row?.document,"11122233396");
  assert.equal(row?.tradeName,null);
});
test("busca rejeita filtro sem conteúdo e neutraliza sintaxe da query", () => {
  assert.equal(sanitizeDigitalClientSearch("*"),null);
  assert.equal(sanitizeDigitalClientSearch("a"),null);
  assert.equal(sanitizeDigitalClientSearch("  Maria, (x)  "),"Maria x");
});

test("integração remota não foi liberada neste release, independentemente de ambiente", () => {
  // A rota consulta esta trava ANTES de segredo, env, sessão e banco.
  // Alterar o valor exige revisão e autorização específica no release futuro.
  assert.equal(ALTNIX_CLIENT_EXPORT_RELEASED, false);
});
