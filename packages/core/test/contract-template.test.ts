import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client, ContractTemplate, InstitutionalContract } from "@ir/types";
import { resolveTemplateVariables } from "../src/financeiro/contract-template-merge";
import {
  ContractTemplateNotFoundError, type ContractTemplateRepository, type NewContractTemplateVersionRecord,
} from "../src/financeiro/contract-template-repository";
import { ContractTemplateService, ContractTemplateValidationError } from "../src/financeiro/contract-template-service";

const CLIENT: Pick<Client, "kind" | "fullName" | "companyName" | "tradeName" | "cpf" | "cnpj" | "responsibleName" | "phonePrimary" | "whatsapp" | "email" | "address"> = {
  kind: "company",
  fullName: undefined,
  companyName: "Exemplo Comercio de Anuncios Ltda",
  tradeName: "Exemplo Anuncios",
  cpf: undefined,
  cnpj: "23970969000190",
  responsibleName: "Maria da Silva",
  phonePrimary: "48999990000",
  whatsapp: undefined,
  email: "contato@exemplo.invalid",
  address: { zip: "88900000", street: "Rua das Flores", number: "100", complement: undefined, neighborhood: "Centro", city: "São João do Sul", state: "SC" },
};

const CONTRACT: Pick<InstitutionalContract, "contractNumber" | "reference" | "object" | "contractedAmount" | "startsAt" | "endsAt"> = {
  contractNumber: "012/2026",
  reference: "IR-CTR-2026-000012",
  object: "Prestação de serviços de publicidade institucional",
  contractedAmount: 1500.5,
  startsAt: "2026-01-01",
  endsAt: "2026-12-31",
};

test("resolveTemplateVariables preenche automaticamente os campos do cliente/contrato já cadastrados", () => {
  const result = resolveTemplateVariables({
    content: "Contrato {{contrato.numero}} com {{cliente.nome}}, CNPJ {{cliente.cpf_cnpj}}, valor {{contrato.valor}}.",
    variables: [], client: CLIENT, contract: CONTRACT, customValues: {}, generatedAt: new Date("2026-10-17T12:00:00"),
  });
  assert.equal(result.missingRequired.length, 0);
  assert.ok(result.resolvedContent.startsWith("Contrato 012/2026 com Exemplo Anuncios, CNPJ 23.970.969/0001-90, valor "));
  assert.ok(result.resolvedContent.includes("1.500,50"));
});

test("resolveTemplateVariables lista exatamente os campos obrigatórios ausentes — nunca inventa valor", () => {
  const result = resolveTemplateVariables({
    content: "Forma de pagamento: {{forma_pagamento}}.",
    variables: [{ key: "forma_pagamento", label: "Forma de pagamento", required: true }],
    client: CLIENT, contract: CONTRACT, customValues: {}, generatedAt: new Date("2026-10-17T12:00:00"),
  });
  assert.equal(result.missingRequired.length, 1);
  assert.equal(result.missingRequired[0].key, "forma_pagamento");
  // Nunca gera o conteúdo final enquanto faltar campo obrigatório.
  assert.equal(result.resolvedContent, "Forma de pagamento: {{forma_pagamento}}.");
});

test("resolveTemplateVariables substitui campo variável opcional preenchido pelo operador", () => {
  const result = resolveTemplateVariables({
    content: "Forma de pagamento: {{forma_pagamento}}.",
    variables: [{ key: "forma_pagamento", label: "Forma de pagamento", required: true }],
    client: CLIENT, contract: CONTRACT, customValues: { forma_pagamento: "Boleto mensal" }, generatedAt: new Date("2026-10-17T12:00:00"),
  });
  assert.equal(result.missingRequired.length, 0);
  assert.equal(result.resolvedContent, "Forma de pagamento: Boleto mensal.");
});

test("resolveTemplateVariables faz substituição literal — placeholder com caracteres de regex não quebra nem é interpretado", () => {
  const result = resolveTemplateVariables({
    content: "Valor: {{contrato.valor}}. Objeto: {{contrato.objeto}}.",
    variables: [], client: CLIENT, contract: { ...CONTRACT, object: "Serviço (com parênteses) e $pecial* chars" },
    customValues: {}, generatedAt: new Date("2026-10-17T12:00:00"),
  });
  assert.ok(result.resolvedContent.includes("Serviço (com parênteses) e $pecial* chars"));
});

test("resolveTemplateVariables preserva acentuação sem alteração", () => {
  const result = resolveTemplateVariables({
    content: "Município: {{cliente.endereco}}.",
    variables: [], client: CLIENT, contract: CONTRACT, customValues: {}, generatedAt: new Date("2026-10-17T12:00:00"),
  });
  assert.ok(result.resolvedContent.includes("São João do Sul"));
});

// --- ContractTemplateService (versionamento) ---

class FakeContractTemplateRepository implements ContractTemplateRepository {
  public rows: ContractTemplate[] = [];
  async listCurrentVersions() {
    const byGroup = new Map<string, ContractTemplate>();
    for (const row of this.rows) {
      const current = byGroup.get(row.groupId);
      if (!current || row.version > current.version) byGroup.set(row.groupId, row);
    }
    return [...byGroup.values()];
  }
  async getById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async listVersionsByGroup(groupId: string) {
    return this.rows.filter((r) => r.groupId === groupId).sort((a, b) => b.version - a.version);
  }
  async getLatestVersionByGroup(groupId: string) {
    const versions = await this.listVersionsByGroup(groupId);
    return versions[0] ?? null;
  }
  async createFirstVersion(record: NewContractTemplateVersionRecord) {
    const id = `tpl-${this.rows.length + 1}`;
    const row: ContractTemplate = { id, groupId: id, version: 1, active: true, createdAt: "2026-10-17T10:00:00Z", ...record };
    this.rows.push(row);
    return row;
  }
  async createNextVersion(groupId: string, record: NewContractTemplateVersionRecord) {
    const latest = await this.getLatestVersionByGroup(groupId);
    const nextVersion = (latest?.version ?? 0) + 1;
    const id = `tpl-${this.rows.length + 1}`;
    const row: ContractTemplate = { id, groupId, version: nextVersion, active: true, createdAt: "2026-10-17T10:00:00Z", ...record };
    this.rows.push(row);
    return row;
  }
  async setActive(id: string, active: boolean) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error("not found");
    row.active = active;
    return row;
  }
}

test("create rejeita conteúdo vazio e título curto — nunca cria um modelo inválido", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  await assert.rejects(() => service.create({ title: "ab", content: "x", variables: [] }), ContractTemplateValidationError);
  await assert.rejects(() => service.create({ title: "Modelo válido", content: "", variables: [] }), ContractTemplateValidationError);
});

test("createNewVersion nunca sobrescreve a versão anterior — histórico sempre preservado", async () => {
  const repo = new FakeContractTemplateRepository();
  const service = new ContractTemplateService(repo);
  const v1 = await service.create({ title: "Modelo de publicidade", content: "Conteúdo v1", variables: [] });
  const v2 = await service.createNewVersion(v1.groupId, { title: "Modelo de publicidade", content: "Conteúdo v2", variables: [] });
  assert.equal(v2.version, 2);
  const history = await service.listVersionHistory(v1.groupId);
  assert.equal(history.length, 2);
  assert.equal(history.find((h) => h.version === 1)?.content, "Conteúdo v1");
  assert.equal(history.find((h) => h.version === 2)?.content, "Conteúdo v2");
});

test("duplicate cria um GRUPO novo, independente do original — nunca uma versão do mesmo grupo", async () => {
  const repo = new FakeContractTemplateRepository();
  const service = new ContractTemplateService(repo);
  const original = await service.create({ title: "Modelo institucional", content: "Conteúdo original", variables: [] });
  const copy = await service.duplicate(original.id);
  assert.notEqual(copy.groupId, original.groupId);
  assert.equal(copy.version, 1);
  assert.equal(copy.content, "Conteúdo original");
});

test("createNewVersion falha com grupo inexistente — nunca cria versão 'órfã'", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  await assert.rejects(
    () => service.createNewVersion("grupo-inexistente", { title: "Modelo qualquer", content: "Conteúdo qualquer", variables: [] }),
    ContractTemplateNotFoundError,
  );
});

test("campo variável com chave inválida (fora do padrão) é rejeitado", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  await assert.rejects(
    () => service.create({ title: "Modelo", content: "{{Campo Com Espaco}}", variables: [{ key: "Campo Com Espaco", label: "X", required: true }] }),
    ContractTemplateValidationError,
  );
});
