#!/usr/bin/env node
/**
 * Pré-voo SOMENTE LEITURA: compara migrations do Git com histórico exportado
 * do Supabase. Não conecta a bancos, não lê segredos, não executa SQL.
 *
 * Uso:
 * node scripts/release/migration-preflight.mjs --remote /local/ledger.json
 *
 * O JSON de entrada deve conter {"migrations":[{"version":"YYYYMMDDHHMMSS",
 * "name":"..."}]}; saída JSON stdout, erro/NO-GO via exit code 2.
 * Nunca tratar nomes iguais com versões diferentes como migrations aplicadas.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const VERSION = /^([0-9]{14})_([a-zA-Z][a-zA-Z0-9_]*)\.sql$/;

export function inspectMigrationLedger(localFilenames, remoteLedger) {
  if (!Array.isArray(localFilenames) || !Array.isArray(remoteLedger)) {
    throw new Error("Informe arquivos locais e lista remota de migrations.");
  }
  const local = new Map();
  const remote = new Map();
  const localDuplicates = [];
  const remoteDuplicates = [];
  for (const file of localFilenames) {
    const match = VERSION.exec(file);
    if (!match) throw new Error("Nome de migration local inválido: " + file);
    if (local.has(match[1])) localDuplicates.push(match[1]);
    local.set(match[1], { version: match[1], name: match[2], file });
  }
  for (const row of remoteLedger) {
    const version = row?.version, name = row?.name;
    if (typeof version !== "string" || !/^\d{14}$/.test(version) ||
        typeof name !== "string" || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error("Histórico remoto inválido: versões e nomes devem ser metadados de migrations.");
    }
    if (remote.has(version)) remoteDuplicates.push(version);
    remote.set(version, { version, name });
  }
  const missingInGit = [...remote.values()].filter(x => !local.has(x.version));
  const notApplied = [...local.values()].filter(x => !remote.has(x.version));
  const differentName = [...remote.values()].flatMap(x => {
    const candidate = local.get(x.version);
    return candidate && candidate.name !== x.name
      ? [{ version: x.version, remoteName: x.name, localName: candidate.name }] : [];
  });
  // Mesmo nome COM versão diferente é aviso, NÃO prova mesma SQL.
  const possibleRenamed = missingInGit.flatMap(x => notApplied
    .filter(y => y.name === x.name)
    .map(y => ({ remoteVersion: x.version, localVersion: y.version, name: x.name,
      requiredAction: "Revisão manual de SQL/migrations; nunca marcar automaticamente como aplicado." })));
  return {
    localCount: localFilenames.length,
    remoteCount: remoteLedger.length,
    matchedCount: [...remote.keys()].filter(x => local.has(x)).length,
    missingInGit, notApplied, differentName, possibleRenamed,
    localDuplicates, remoteDuplicates,
    safeToAutoApply: false,
    verdict: missingInGit.length || differentName.length || localDuplicates.length || remoteDuplicates.length
      ? "NO-GO: histórico divergiu; exigida conciliação humana"
      : notApplied.length ? "NO-GO: há migrations pendentes de avaliação e backup"
      : "HISTÓRICO ALINHADO: ainda exigem-se backup, permissões, QA e autorização para aplicar quaisquer alterações",
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--remote") {
    process.stderr.write("Uso: node scripts/release/migration-preflight.mjs --remote /caminho/ledger.json\n");
    process.exitCode = 2;
    return;
  }
  const filenames = (await readdir(MIGRATIONS_DIR)).filter(x => x.endsWith(".sql"));
  const ledger = JSON.parse(await readFile(args[1], "utf8"));
  const result = inspectMigrationLedger(filenames, ledger.migrations ?? ledger);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (result.missingInGit.length || result.notApplied.length ||
      result.differentName.length || result.localDuplicates.length ||
      result.remoteDuplicates.length) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    process.stderr.write("Pré-voo bloqueado: " + (err instanceof Error ? err.message : "falha desconhecida") + "\n");
    process.exitCode = 2;
  });
}
