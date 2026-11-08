#!/usr/bin/env node
/**
 * Backup privado, independente e VERIFICÁVEL dos documentos/assinaturas.
 *
 * Por padrão: --dry-run (somente leitura Supabase). Nenhuma operação
 * apaga, sobrescreve ou publica o arquivo original.
 *
 * --backup              Copia novos hashes para bucket R2 DEDICADO e
 *                       grava manifesto de todo o inventário do momento.
 * --verify <manifest>   Rebaixa todos os objetos do manifesto, confere SHA.
 * --restore-test <key>  Restaura UM objeto em diretório temporário, relê
 *                       e confirma o SHA, apagando só a cópia temporária.
 *
 * A rotina é manual nesta etapa, não agenda nem solicita credenciais ao
 * navegador. Nunca usar o bucket público de mídias/edições para contratos.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const BUCKETS = [
  "contract-documents",
  "contract-signatures",
  "signature-images",
  "contract-template-files",
];
const args = process.argv.slice(2);
const mode = args[0] ?? "--dry-run";
if (!["--dry-run", "--backup", "--verify", "--restore-test"].includes(mode)) {
  throw new Error("Use --dry-run | --backup | --verify <manifest-key> | --restore-test <manifest-key>.");
}
function env(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Configuração ausente: " + name);
  return value;
}
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const backupBucket = env("SIGNATURE_BACKUP_R2_BUCKET");
if ([process.env.R2_BUCKET, process.env.R2_EDITIONS_BUCKET].filter(Boolean).includes(backupBucket)) {
  throw new Error("Backup exige bucket SEPARADO dos buckets de mídia e de edições.");
}
const r2 = new S3Client({
  endpoint: env("SIGNATURE_BACKUP_R2_ENDPOINT"),
  region: "auto",
  credentials: {
    accessKeyId: env("SIGNATURE_BACKUP_R2_ACCESS_KEY_ID"),
    secretAccessKey: env("SIGNATURE_BACKUP_R2_SECRET_ACCESS_KEY"),
  },
});
const hex = bytes => createHash("sha256").update(bytes).digest("hex");
const bufferOf = async body => Buffer.from(await new Response(body).arrayBuffer());

async function* listObjects(bucket, prefix = "", depth = 0) {
  if (depth > 12) throw new Error("Estrutura de pastas do Storage muito profunda.");
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket)
      .list(prefix || undefined, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error("Falha ao listar bucket " + bucket + ": " + error.message);
    const rows = data ?? [];
    for (const item of rows) {
      const full = [prefix, item.name].filter(Boolean).join("/");
      if (item.id) {
        yield full;
      } else if (item.name && item.name !== ".emptyFolderPlaceholder") {
        yield* listObjects(bucket, full, depth + 1);
      }
    }
    if (rows.length < 100) break;
    offset += 100;
  }
}

async function readSource(bucket, key) {
  const { data, error } = await supabase.storage.from(bucket).download(key);
  if (error || !data) throw new Error("Objeto original indisponível: " + bucket + "/" + key);
  return Buffer.from(await data.arrayBuffer());
}
function contentKey(sha) {
  return "objects/sha256/" + sha.slice(0, 2) + "/" + sha;
}
async function readR2(key) {
  const result = await r2.send(new GetObjectCommand({ Bucket: backupBucket, Key: key }));
  if (!result.Body) throw new Error("Objeto de backup sem conteúdo.");
  return bufferOf(result.Body);
}
async function hasR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: backupBucket, Key: key }));
    return true;
  } catch (error) {
    const code = error?.$metadata?.httpStatusCode;
    if (code === 404 || error?.name === "NotFound") return false;
    throw error;
  }
}
async function writeNewR2(key, bytes, type = "application/octet-stream") {
  if (await hasR2(key)) return false;
  await r2.send(new PutObjectCommand({
    Bucket: backupBucket, Key: key, Body: bytes,
    ContentType: type, Metadata: { "sha256": hex(bytes) },
    IfNoneMatch: "*",
  }));
  return true;
}

async function createBackup(dryRun) {
  const manifest = {
    format: "informativo-regional-signature-backup-v1",
    createdAt: new Date().toISOString(),
    source: "private-supabase-storage",
    entries: [],
  };
  let copied = 0, alreadyPresent = 0;
  for (const bucket of BUCKETS) {
    for await (const key of listObjects(bucket)) {
      const bytes = await readSource(bucket, key);
      const sha256 = hex(bytes);
      const objectKey = contentKey(sha256);
      if (!dryRun) {
        if (await writeNewR2(objectKey, bytes)) copied += 1;
        else alreadyPresent += 1;
      }
      manifest.entries.push({
        bucket, path: key, sha256, bytes: bytes.byteLength, objectKey,
      });
    }
  }
  if (dryRun) {
    console.log(JSON.stringify({ mode: "dry-run", files: manifest.entries.length,
      totalBytes: manifest.entries.reduce((a, b) => a + b.bytes, 0) }, null, 2));
    return;
  }
  const key = "manifests/" + new Date().toISOString().slice(0, 10) + "/" + randomUUID() + ".json";
  const json = Buffer.from(JSON.stringify(manifest, null, 2));
  await writeNewR2(key, json, "application/json");
  console.log(JSON.stringify({
    backup: "created", manifestKey: key, files: manifest.entries.length,
    newObjects: copied, reusedObjects: alreadyPresent,
  }, null, 2));
}

async function manifestFrom(key) {
  if (!/^manifests\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.json$/.test(key)) {
    throw new Error("Chave do manifesto inválida.");
  }
  const json = JSON.parse((await readR2(key)).toString("utf8"));
  if (json.format !== "informativo-regional-signature-backup-v1" || !Array.isArray(json.entries)) {
    throw new Error("Formato de manifesto não reconhecido.");
  }
  return json;
}

async function verifyRestore(manifestKey, restoreOne) {
  const manifest = await manifestFrom(manifestKey);
  if (!manifest.entries.length) throw new Error("Manifesto sem objetos.");
  const entries = restoreOne ? [manifest.entries[0]] : manifest.entries;
  let checked = 0;
  for (const entry of entries) {
    if (!BUCKETS.includes(entry.bucket) || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      entry.objectKey !== contentKey(entry.sha256) || entry.bytes < 1) {
      throw new Error("Manifesto com entrada inválida.");
    }
    const restored = await readR2(entry.objectKey);
    if (hex(restored) !== entry.sha256 || restored.length !== entry.bytes) {
      throw new Error("FALHA: hash/tamanho do backup diverge de " + entry.objectKey);
    }
    if (restoreOne) {
      const dir = await mkdtemp(path.join(tmpdir(), "ir-signature-restore-"));
      try {
        const target = path.join(dir, "restored-object");
        await writeFile(target, restored, { flag: "wx" });
        const readBack = await readFile(target);
        if (hex(readBack) !== entry.sha256) throw new Error("FALHA na restauração local.");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
    checked += 1;
  }
  console.log(JSON.stringify({ status: "verified", manifestKey, checked,
    restoreTest: restoreOne }, null, 2));
}

if (mode === "--dry-run") await createBackup(true);
else if (mode === "--backup") await createBackup(false);
else await verifyRestore(args[1] ?? "", mode === "--restore-test");
