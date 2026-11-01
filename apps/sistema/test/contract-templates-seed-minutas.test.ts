import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ContractTemplateService } from "@ir/core";
import type { ContractTemplateRepository, NewContractTemplateVersionRecord } from "@ir/core";
import type { ContractTemplate } from "@ir/types";
import { missingCommercialLegalParties } from "../src/lib/contracts/commercialPartyRequirements";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  __dirname,
  "../../../supabase/migrations/20261101100000_contract_templates_seed_minutas.sql",
);

/**
 * Lê o SQL de verdade e confere as 6 minutas do Bloco 3 (01/11/2026)
 * contra as regras REAIS do sistema — nunca uma cópia/paralela delas.
 * Evita exatamente o erro que o usuário pediu pra prevenir: "não
 * inventar identificadores incompatíveis com o banco" ficaria sem
 * verificação automática se este teste só conferisse uma transcrição
 * manual do conteúdo, e não o arquivo que de fato seria aplicado.
 */
function parseSeedMigration(sql: string): Array<{ category: string; content: string; variables: Array<{ key: string; label: string; required: boolean }> }> {
  const results: Array<{ category: string; content: string; variables: Array<{ key: string; label: string; required: boolean }> }> = [];
  const contentRe = /'((?:[^']|'')*)',\s*\n\s*(\$[a-zA-Z_]*\$)([\s\S]*?)\2,\s*\n\s*'(\[[\s\S]*?\])'::jsonb/g;
  let match: RegExpExecArray | null;
  while ((match = contentRe.exec(sql)) !== null) {
    const [, category, , content, variablesJson] = match;
    results.push({
      category: category.replace(/''/g, "'"),
      content,
      variables: JSON.parse(variablesJson),
    });
  }
  return results;
}

class FakeContractTemplateRepository implements ContractTemplateRepository {
  private rows: ContractTemplate[] = [];
  async listCurrentVersions() { return this.rows; }
  async getById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async listVersionsByGroup(groupId: string) { return this.rows.filter((r) => r.groupId === groupId); }
  async getLatestVersionByGroup(groupId: string) {
    return this.rows.filter((r) => r.groupId === groupId).sort((a, b) => b.version - a.version)[0] ?? null;
  }
  async createFirstVersion(record: NewContractTemplateVersionRecord) {
    const id = `id-${this.rows.length}`;
    const row: ContractTemplate = { id, groupId: id, version: 1, active: true, createdAt: new Date().toISOString(), ...record };
    this.rows.push(row);
    return row;
  }
  async createNextVersion(groupId: string, record: NewContractTemplateVersionRecord) {
    const version = (await this.getLatestVersionByGroup(groupId))!.version + 1;
    const row: ContractTemplate = { id: `id-${this.rows.length}`, groupId, version, active: true, createdAt: new Date().toISOString(), ...record };
    this.rows.push(row);
    return row;
  }
  async setActive(id: string, active: boolean) {
    const row = this.rows.find((r) => r.id === id)!;
    row.active = active;
    return row;
  }
}

test("as 6 minutas do seed (Bloco 3) existem e têm categoria/variáveis/conteúdo coerentes com o arquivo real", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const templates = parseSeedMigration(sql);
  assert.equal(templates.length, 6, "esperava exatamente 6 INSERTs no seed — se esse número mudou, atualize este teste também");
});

test("cada minuta comercial (categoria commercial_*) passa missingCommercialLegalParties — exigência real da emissão de documentos", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const templates = parseSeedMigration(sql);
  const commercial = templates.filter((t) => t.category.startsWith("commercial_"));
  assert.equal(commercial.length, 5, "esperava 5 minutas comerciais (publicidade impressa/digital/LED, locação, combinado)");
  for (const template of commercial) {
    const declared = template.variables.map((v) => v.key);
    const missing = missingCommercialLegalParties(template.content, declared);
    assert.deepEqual(missing, [], `minuta "${template.category}" deveria passar missingCommercialLegalParties, mas faltou: ${missing.join("; ")}`);
  }
});

test("cada minuta do seed passa a validação real de ContractTemplateService.create — nenhuma chave de variável incompatível com o banco", async () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const templates = parseSeedMigration(sql);
  for (const template of templates) {
    const service = new ContractTemplateService(new FakeContractTemplateRepository());
    await assert.doesNotReject(
      () => service.create({ title: "Minuta de teste", category: template.category, content: template.content, variables: template.variables }),
      `minuta "${template.category}" deveria passar a validação real de create()`,
    );
  }
});

test("toda variável declarada é usada no conteúdo e todo placeholder usado está declarado ou é um auto-field conhecido — nunca sobra nem falta", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const templates = parseSeedMigration(sql);
  const AUTO_FIELDS = new Set([
    "cliente.nome", "cliente.cpf_cnpj", "cliente.endereco", "cliente.representante", "cliente.contato",
    "contrato.numero", "contrato.referencia", "contrato.objeto", "contrato.valor",
    "contrato.vigencia_inicio", "contrato.vigencia_fim", "data.hoje",
    "cliente.documento", "cliente.representante_cpf", "cliente.qualificacao",
    "venda.referencia", "venda.valor", "servicos.resumo",
  ]);
  for (const template of templates) {
    const used = new Set([...template.content.matchAll(/\{\{([a-zA-Z0-9_.-]+)\}\}/g)].map((m) => m[1]));
    const declared = new Set(template.variables.map((v) => v.key));
    for (const key of declared) {
      assert.ok(used.has(key), `minuta "${template.category}": variável "${key}" declarada mas nunca usada no conteúdo`);
    }
    for (const key of used) {
      assert.ok(
        AUTO_FIELDS.has(key) || declared.has(key),
        `minuta "${template.category}": placeholder "{{${key}}}" usado no conteúdo mas não declarado em variables nem é um auto-field conhecido`,
      );
    }
  }
});
