import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkNfsePreparationSchemaWithProbe,
  NFSE_OBSERVATIONS_MIGRATION,
  NFSE_REQUIRED_PREPARATION_COLUMNS,
  NFSE_SCHEMA_NOT_READY_MESSAGE,
} from "../src/lib/nfse/nfseSchemaPreflight";

const root = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("schema preflight: somente confirma prontidão quando os 3 campos existem", async () => {
  const called: string[] = [];
  const result = await checkNfsePreparationSchemaWithProbe(async (table, column) => {
    called.push(`${table}.${column}`);
    return { error: null };
  });
  assert.deepEqual(result, { ready: true, missingColumns: [], checkFailed: false });
  assert.deepEqual(called, NFSE_REQUIRED_PREPARATION_COLUMNS.map(({ table, column }) => `${table}.${column}`));
});

test("schema preflight: coluna desconhecida 42703 bloqueia antes de qualquer mutação", async () => {
  const result = await checkNfsePreparationSchemaWithProbe(async (table, column) => ({
    error: table === "nfse_drafts" && column === "fiscal_observation"
      ? { code: "42703" } : null,
  }));
  assert.deepEqual(result, {
    ready: false,
    missingColumns: ["nfse_drafts.fiscal_observation"],
    checkFailed: false,
  });
});

test("schema preflight: PGRST204 de cache não equivale a sistema pronto", async () => {
  const result = await checkNfsePreparationSchemaWithProbe(async (table) => ({
    error: table === "nfse_issuer_configs" ? { code: "PGRST204" } : null,
  }));
  assert.equal(result.ready, false);
  assert.deepEqual(result.missingColumns, ["nfse_issuer_configs.default_fiscal_observation"]);
});

test("schema preflight: conexão falha ou RLS insuficiente nunca libera escrita", async () => {
  const transport = await checkNfsePreparationSchemaWithProbe(async () => {
    throw new Error("timeout");
  });
  assert.equal(transport.ready, false);
  assert.equal(transport.checkFailed, true);
  const permission = await checkNfsePreparationSchemaWithProbe(async () => ({
    error: { code: "42501" },
  }));
  assert.equal(permission.ready, false);
  assert.equal(permission.checkFailed, true);
  assert.match(NFSE_SCHEMA_NOT_READY_MESSAGE, /Nenhum dado fiscal foi alterado/);
});

test("preflight é SELECT LIMIT 0 sem dados privados, migration não é executada pela app", () => {
  const source = root("../src/lib/nfse/nfseSchemaPreflight.ts");
  assert.match(source, /client\.from\(table\)\.select\(column\)\.limit\(0\)/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  const migration = root(`../../../supabase/migrations/${NFSE_OBSERVATIONS_MIGRATION}`);
  for (const { table, column } of NFSE_REQUIRED_PREPARATION_COLUMNS) {
    assert.ok(migration.includes(table), table);
    assert.ok(migration.includes(column), column);
  }
  assert.match(migration, /nfse_draft_additional_info_guard/);
  assert.match(migration, /guard_nfse_draft_fiscal_edit/);
});

test("todas as telas fiscais que selecionam observações fazem preflight antes da consulta", () => {
  const paths = [
    "../src/app/sistema/nfse/page.tsx",
    "../src/app/sistema/nfse/configuracoes/page.tsx",
    "../src/app/sistema/nfse/nova/page.tsx",
    "../src/app/sistema/nfse/rascunhos/page.tsx",
    "../src/app/sistema/nfse/rascunhos/[id]/page.tsx",
    "../src/app/sistema/nfse/notas/page.tsx",
  ];
  for (const path of paths) {
    const source = root(path);
    const probe = source.indexOf("await checkNfsePreparationSchema(supabase)");
    const guard = source.indexOf("if (!schema.ready) return <NfseSchemaNotReady");
    assert.ok(probe >= 0 && guard > probe, path);
    assert.ok(guard < source.indexOf("getDraftService(supabase)") || !source.includes("getDraftService(supabase)"), path);
    assert.ok(guard < source.indexOf("getIssuerConfigService(supabase)") || !source.includes("getIssuerConfigService(supabase)"), path);
  }
  const checker = root("../src/lib/permissions/checkModuleAction.ts");
  assert.match(checker, /module === "nfse" && isNfsePreparationAction\(action\)/);
  assert.match(checker, /if \(!schema\.ready\) return NFSE_SCHEMA_NOT_READY_MESSAGE/);
});
