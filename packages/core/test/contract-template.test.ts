import { test } from "node:test";
import assert from "node:assert/strict";
import { contractTemplateStage, type Client, type ContractTemplate, type InstitutionalContract } from "@ir/types";
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
    const row = this.build(id, id, 1, record);
    this.rows.push(row);
    return row;
  }
  async createNextVersion(groupId: string, record: NewContractTemplateVersionRecord) {
    const latest = await this.getLatestVersionByGroup(groupId);
    const nextVersion = (latest?.version ?? 0) + 1;
    const id = `tpl-${this.rows.length + 1}`;
    const row = this.build(id, groupId, nextVersion, record);
    this.rows.push(row);
    return row;
  }
  private build(id: string, groupId: string, version: number, record: NewContractTemplateVersionRecord): ContractTemplate {
    const { attachment, ...rest } = record;
    this.paths.set(id, attachment?.path ?? null);
    // Mesmo contrato do banco: toda versão nasce rascunho (inativa, sem teste, sem aprovação).
    return {
      id, groupId, version, createdAt: "2026-10-17T10:00:00Z", ...rest,
      active: false, testEnabled: false,
      attachment: attachment ? { sha256: attachment.sha256, bytes: attachment.bytes, note: attachment.note } : undefined,
    };
  }
  public paths = new Map<string, string | null>();
  private find(id: string): ContractTemplate {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error("not found");
    return row;
  }
  async setActive(id: string, active: boolean) {
    const row = this.find(id);
    if (active && !row.legalApproval) throw new Error("Ativação para produção exige aprovação jurídica registrada para esta versão.");
    row.active = active;
    return row;
  }
  async setTestMode(id: string, enabled: boolean) {
    const row = this.find(id);
    row.testEnabled = enabled;
    return row;
  }
  async recordLegalApproval(id: string, note: string, evidence: string) {
    const row = this.find(id);
    row.legalApproval = { approvedAt: "2026-11-08T10:00:00Z", approvedByProfileId: "admin-1", note, evidence, contentSha256: "a".repeat(64) };
    return row;
  }
  async revokeLegalApproval(id: string, _reason: string) {
    const row = this.find(id);
    row.legalApproval = undefined;
    row.active = false;
    return row;
  }
  async getAttachmentPath(id: string) { return this.paths.get(id) ?? null; }
}

test("create rejeita conteúdo vazio e título curto — nunca cria um modelo inválido", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  await assert.rejects(() => service.create({ title: "ab", content: "x", variables: [] }), ContractTemplateValidationError);
  await assert.rejects(() => service.create({ title: "Modelo válido", content: "", variables: [] }), ContractTemplateValidationError);
});

test("createNewVersion nunca sobrescreve a versão anterior — histórico sempre preservado", async () => {
  const repo = new FakeContractTemplateRepository();
  const service = new ContractTemplateService(repo);
  const v1 = await service.create({ title: "Modelo de publicidade", content: "Conteúdo v1", variables: [], modality: "commercial" });
  const v2 = await service.createNewVersion(v1.groupId, { title: "Modelo de publicidade", content: "Conteúdo v2", variables: [], modality: "commercial" });
  assert.equal(v2.version, 2);
  const history = await service.listVersionHistory(v1.groupId);
  assert.equal(history.length, 2);
  assert.equal(history.find((h) => h.version === 1)?.content, "Conteúdo v1");
  assert.equal(history.find((h) => h.version === 2)?.content, "Conteúdo v2");
});

test("duplicate cria um GRUPO novo, independente do original — nunca uma versão do mesmo grupo", async () => {
  const repo = new FakeContractTemplateRepository();
  const service = new ContractTemplateService(repo);
  const original = await service.create({ title: "Modelo institucional", content: "Conteúdo original", variables: [], modality: "institutional", specificFor: "Licitação — Prefeitura" });
  const copy = await service.duplicate(original.id);
  assert.notEqual(copy.groupId, original.groupId);
  assert.equal(copy.version, 1);
  assert.equal(copy.content, "Conteúdo original");
  assert.equal(copy.modality, "institutional");
  assert.equal(copy.specificFor, "Licitação — Prefeitura");
  assert.equal(copy.active, false);
  assert.equal(copy.testEnabled, false);
});

test("createNewVersion falha com grupo inexistente — nunca cria versão 'órfã'", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  await assert.rejects(
    () => service.createNewVersion("grupo-inexistente", { title: "Modelo qualquer", content: "Conteúdo qualquer", variables: [], modality: "commercial" }),
    ContractTemplateNotFoundError,
  );
});

test("campo variável com chave inválida (fora do padrão) é rejeitado", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  await assert.rejects(
    () => service.create({ title: "Modelo", modality: "commercial", content: "{{Campo Com Espaco}}", variables: [{ key: "Campo Com Espaco", label: "X", required: true }] }),
    ContractTemplateValidationError,
  );
});

test("campo variável aceita um 'prefixo.sufixo' (ex.: contratada.cnpj) — exigido pela emissão de documentos comerciais", async () => {
  // Achado real (Bloco 3, 01/11/2026): missingCommercialLegalParties (lib/contracts/commercialPartyRequirements.ts,
  // apps/sistema) exige que o modelo declare contratada.razao_social/cnpj/endereco/representante em `variables` —
  // sem essa aceitação aqui, nenhum modelo comercial jamais passaria pela tela de cadastro.
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  const template = await service.create({
    title: "Modelo comercial",
    modality: "commercial",
    content: "{{contratada.razao_social}} {{contratada.cnpj}} {{cliente.qualificacao}}",
    variables: [
      { key: "contratada.razao_social", label: "Razão social da contratada", required: true },
      { key: "contratada.cnpj", label: "CNPJ da contratada", required: true },
    ],
  });
  assert.equal(template.variables[0].key, "contratada.razao_social");
});

test("campo variável rejeita mais de um ponto, ponto nas pontas ou maiúsculas, mesmo com prefixo válido", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  for (const key of ["a.b.c", ".contratada", "contratada.", "Contratada.cnpj", "contratada.CNPJ"]) {
    await assert.rejects(
      () => service.create({ title: "Modelo", modality: "commercial", content: `{{${key}}}`, variables: [{ key, label: "X", required: true }] }),
      ContractTemplateValidationError,
      `deveria rejeitar a chave "${key}"`,
    );
  }
});

// --- Etapa 1 (08/11/2026): modalidade, documento fixo, teste x produção, aprovação jurídica ---

const SHA = "b".repeat(64);
const PDF_ATTACHMENT = { path: `templates/${SHA}.pdf`, sha256: SHA, bytes: 4000 };

test("modalidade é obrigatória em modelo novo e em nova versão", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  await assert.rejects(() => service.create({ title: "Modelo sem modalidade", content: "x", variables: [] }), /modalidade/i);
  const v1 = await service.create({ title: "Modelo com modalidade", content: "x", variables: [], modality: "institutional" });
  await assert.rejects(() => service.createNewVersion(v1.groupId, { title: "Modelo com modalidade", content: "y", variables: [] }), /modalidade/i);
});

test("modelo nasce SEM teste, SEM produção e SEM aprovação jurídica — nunca ativo por padrão", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  const t = await service.create({ title: "Modelo novo", content: "x", variables: [], modality: "commercial" });
  assert.equal(t.active, false);
  assert.equal(t.testEnabled, false);
  assert.equal(t.legalApproval, undefined);
});

test("modelo específico (licitação) guarda 'específico para' sem alterar código; texto curto é rejeitado", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  const t = await service.create({ title: "Contrato licitação", content: "x", variables: [], modality: "institutional", specificFor: "  Licitação — Câmara Municipal  " });
  assert.equal(t.specificFor, "Licitação — Câmara Municipal");
  await assert.rejects(() => service.create({ title: "Contrato licitação", content: "x", variables: [], modality: "institutional", specificFor: "ab" }), ContractTemplateValidationError);
});

test("documento fixo: exige PDF anexo com caminho = hash, não aceita variáveis e usa conteúdo-padrão explícito sobre a conferência manual", async () => {
  const repo = new FakeContractTemplateRepository();
  const service = new ContractTemplateService(repo);
  const fixed = await service.create({ title: "Edital Prefeitura", content: "", variables: [], modality: "institutional", documentMode: "fixed_pdf", attachment: PDF_ATTACHMENT });
  assert.equal(fixed.documentMode, "fixed_pdf");
  assert.equal(fixed.attachment?.sha256, SHA);
  assert.match(fixed.content, /NÃO são mescladas|NÃO mescla/i);
  assert.equal(await service.getAttachmentPath(fixed.id), PDF_ATTACHMENT.path);

  const base = { title: "Edital Prefeitura", content: "", variables: [], modality: "institutional" as const, documentMode: "fixed_pdf" as const };
  await assert.rejects(() => service.create(base), /PDF/);
  await assert.rejects(() => service.create({ ...base, attachment: { ...PDF_ATTACHMENT, path: "templates/outro.pdf" } }), /Anexo inválido/);
  await assert.rejects(() => service.create({ ...base, attachment: { ...PDF_ATTACHMENT, sha256: "c".repeat(64) } }), /Anexo inválido/);
  await assert.rejects(() => service.create({ ...base, attachment: { ...PDF_ATTACHMENT, bytes: 11 * 1024 * 1024 } }), /10 MB/);
  await assert.rejects(
    () => service.create({ ...base, attachment: PDF_ATTACHMENT, variables: [{ key: "campo", label: "Campo", required: true }] }),
    /não mescla variáveis/i,
  );
  await assert.rejects(
    () => service.create({ title: "Texto com anexo", content: "x", variables: [], modality: "commercial", attachment: PDF_ATTACHMENT }),
    /não aceita PDF/i,
  );
});

test("duplicar um documento fixo copia o anexo (mesmo hash) e a cópia nasce rascunho", async () => {
  const repo = new FakeContractTemplateRepository();
  const service = new ContractTemplateService(repo);
  const fixed = await service.create({ title: "Edital", content: "", variables: [], modality: "institutional", documentMode: "fixed_pdf", attachment: PDF_ATTACHMENT });
  await service.setTestMode(fixed.id, true);
  const copy = await service.duplicate(fixed.id);
  assert.equal(copy.documentMode, "fixed_pdf");
  assert.equal(copy.attachment?.sha256, SHA);
  assert.equal(copy.testEnabled, false);
  assert.equal(await service.getAttachmentPath(copy.id), PDF_ATTACHMENT.path);
});

test("teste e produção são estados independentes; produção exige aprovação jurídica", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  const t = await service.create({ title: "Minuta", content: "x", variables: [], modality: "commercial" });
  const tested = await service.setTestMode(t.id, true);
  assert.equal(contractTemplateStage(tested), "test");
  assert.equal(tested.active, false);
  await assert.rejects(() => service.setActive(t.id, true), /aprovação jurídica/);
  const approved = await service.recordLegalApproval(t.id, "Parecer favorável do advogado", "parecer-001");
  assert.ok(approved.legalApproval);
  const live = await service.setActive(t.id, true);
  assert.equal(contractTemplateStage(live), "production");
  const revoked = await service.revokeLegalApproval(t.id, "Cláusula 5 precisa de revisão");
  assert.equal(revoked.active, false);
  assert.equal(revoked.legalApproval, undefined);
});

test("aprovação e revogação exigem nota/evidência/motivo mínimos (clique simples não é parecer jurídico)", async () => {
  const service = new ContractTemplateService(new FakeContractTemplateRepository());
  const t = await service.create({ title: "Minuta", content: "x", variables: [], modality: "commercial" });
  await assert.rejects(() => service.recordLegalApproval(t.id, "ok", "x"), ContractTemplateValidationError);
  await assert.rejects(() => service.recordLegalApproval(t.id, "Parecer favorável do advogado", ""), ContractTemplateValidationError);
  await assert.rejects(() => service.revokeLegalApproval(t.id, "curto"), ContractTemplateValidationError);
});
