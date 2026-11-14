import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTomadorSnapshotFromClient, clientDisplayName, type Client } from "@ir/types";

// Dados totalmente sinteticos: nunca usar clientes reais, CPF/CNPJ ou chaves
// do banco oficial nas fixtures publicadas no GitHub.
const common = {
  id: "cliente-sintetico-1",
  reference: "SINTETICO-001",
  status: "active" as const,
  roles: [],
  createdAt: "2026-11-11T00:00:00Z",
  updatedAt: "2026-11-11T00:00:00Z",
};

test("tomador PJ recebe razao social, nunca nome fantasia usado pelo seletor", () => {
  const client: Client = {
    ...common,
    kind: "company",
    companyName: "EMPRESA SINTETICA TESTE LTDA",
    tradeName: "FANTASIA DE TESTE",
    cnpj: "DOCUMENTO-SINTETICO-NAO-FISCAL",
    address: { city: "Municipio de teste", state: "SC" },
    email: "contato@example.invalid",
    fiscalEmail: "fiscal@example.invalid",
  };
  assert.equal(clientDisplayName(client), "FANTASIA DE TESTE");
  const tomador = buildTomadorSnapshotFromClient(client, clientDisplayName(client));
  assert.equal(tomador.kind, "company");
  assert.equal(tomador.name, "EMPRESA SINTETICA TESTE LTDA");
  assert.equal(tomador.cnpj, client.cnpj);
  assert.equal(tomador.email, "fiscal@example.invalid");
  assert.equal(tomador.city, "Municipio de teste");
  assert.equal(tomador.ibgeCode, undefined, "nao inventar codigo IBGE ausente no Cadastro");
});

test("PJ sem razao social nao transforma fantasia em nome fiscal valido", () => {
  const client: Client = {
    ...common,
    kind: "company",
    tradeName: "SO NOME FANTASIA",
    address: {},
  };
  const tomador = buildTomadorSnapshotFromClient(client, clientDisplayName(client));
  assert.equal(tomador.name, "", "o cadastro deve ser corrigido antes de transmitir");
});

test("tomador PF recebe nome completo e email comum quando fiscal nao cadastrado", () => {
  const client: Client = {
    ...common,
    kind: "individual",
    fullName: "PESSOA FISICA SINTETICA",
    cpf: "CPF-FICTICIO-NAO-FISCAL",
    address: { city: "Municipio de teste", state: "SC" },
    email: "pessoa@example.invalid",
  };
  const tomador = buildTomadorSnapshotFromClient(client, clientDisplayName(client));
  assert.equal(tomador.kind, "individual");
  assert.equal(tomador.name, "PESSOA FISICA SINTETICA");
  assert.equal(tomador.cpf, client.cpf);
  assert.equal(tomador.email, "pessoa@example.invalid");
  assert.equal(tomador.cnpj, undefined);
});
