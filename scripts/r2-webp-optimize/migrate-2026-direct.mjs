#!/usr/bin/env node
// Migração DIRETA de 2026: Supabase Storage -> R2, sem passar por um estágio
// intermediário de "original no R2" (diferente do fluxo usado em 2015-2025,
// que foi migrate.mjs 1:1 seguido de convert.mjs/cutover/cleanup em blocos
// separados). Aqui, por item:
//   1. baixa o original do Supabase Storage (bucket público `article-media`)
//   2. detecta o formato REAL pela assinatura binária (nunca pela extensão)
//   3. decide o destino final:
//        GIF            -> copia o original como está
//        WebP nativo    -> copia o original como está (sem recomprimir)
//        demais formatos-> tenta converter pra WebP (q78 foto / q92 arte-texto
//                          / q90 near-lossless pra transparência real); se a
//                          economia for < 5%, descarta o WebP e copia o
//                          original como está
//   4. sobe SÓ o arquivo final escolhido no R2 (nunca os dois)
//   5. valida (hash, URL pública 200, dimensões/formato conforme o caso)
//   6. só então atualiza media_assets (storage_provider/storage_path/
//      public_url/file_name) — nunca escreve no banco antes de validar
//
// Nunca apaga nem modifica nada no Supabase Storage (continua como backup).
// Idempotente/retomável: relê do banco a cada execução (filtra
// storage_provider='supabase' + ano 2026), então itens já migrados somem
// da lista sozinhos; se um Key já existir no R2, valida antes de reaproveitar
// (nunca sobrescreve silenciosamente).
//
// Uso:
//   node --env-file=.env.local migrate-2026-direct.mjs --dry-run
//   node --env-file=.env.local migrate-2026-direct.mjs --commit --concurrency=4
//   node --env-file=.env.local migrate-2026-direct.mjs --commit --limit=20   (preflight)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createPool, detectActualFormat, fetchBufferRetry, requireEnv, sha256, webpKeyFor } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const YEAR = 2026;
const QUALITY_PHOTO = 78;
const QUALITY_HIGH = 92;

function parseArgs(argv) {
  const args = { commit: false, concurrency: 4, limit: 0 };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, "").split("=");
    if (key === "commit") args.commit = true;
    else if (key === "dry-run") args.commit = false;
    else if (key === "concurrency") args.concurrency = Number(value);
    else if (key === "limit") args.limit = Number(value);
  }
  return args;
}

requireEnv([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
]);

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SUPABASE_PUBLIC_BASE = `${process.env.SUPABASE_URL}/storage/v1/object/public/article-media`;
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "");

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function r2Head(key) {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { exists: true, size: res.ContentLength };
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return { exists: false };
    throw e;
  }
}

async function r2Get(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return streamToBuffer(res.Body);
}

/** Pagina uma tabela simples (sem embed) até o fim — evita join profundo no PostgREST, que estourou statement_timeout em volume alto. */
async function fetchAll(table, select, filterFn) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    let q = sb.from(table).select(select).order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/** Mesmo esquema de join em 3 consultas planas usado na migração 2015-2025 (embed aninhado estoura statement_timeout em volume alto). */
async function fetchPending2026() {
  console.log("  carregando article_external_sources...");
  const sources = await fetchAll("article_external_sources", "article_id, original_published_at");
  const originalPublishedByArticle = new Map();
  for (const s of sources) {
    if (s.original_published_at && !originalPublishedByArticle.has(s.article_id)) {
      originalPublishedByArticle.set(s.article_id, s.original_published_at);
    }
  }
  console.log("  carregando articles...");
  const articles = await fetchAll("articles", "id, published_at, created_at");
  const yearByArticle = new Map();
  for (const a of articles) {
    const iso = originalPublishedByArticle.get(a.id) || a.published_at || a.created_at;
    yearByArticle.set(a.id, iso ? new Date(iso).getUTCFullYear() : null);
  }
  console.log("  carregando article_media...");
  const links = await fetchAll("article_media", "article_id, media_id");
  const yearByMedia = new Map();
  for (const l of links) {
    if (!yearByMedia.has(l.media_id)) yearByMedia.set(l.media_id, yearByArticle.get(l.article_id) ?? null);
  }
  console.log("  carregando media_assets pendentes (storage_provider=supabase)...");
  const assets = await fetchAll("media_assets", "id, storage_path, mime_type, file_name, storage_provider", (q) => q.eq("storage_provider", "supabase"));

  return assets
    .map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      fileName: row.file_name,
      declaredMime: row.mime_type,
      year: yearByMedia.get(row.id) ?? null,
    }))
    .filter((r) => r.year === YEAR);
}

/** Mesmo critério usado no bloco 2020-2024/2025 — ver convert.mjs para a justificativa completa de cada caso. */
async function chooseProfile(buf) {
  const img = sharp(buf, { animated: false });
  const meta = await img.metadata();
  const hasAlpha = Boolean(meta.hasAlpha);
  let realTransparency = false;
  if (hasAlpha) {
    try {
      const stats = await sharp(buf).stats();
      const alphaChannel = stats.channels[stats.channels.length - 1];
      realTransparency = alphaChannel.min < 250;
    } catch {
      realTransparency = true;
    }
  }
  let lowColorGraphic = false;
  try {
    const { data, info } = await sharp(buf).resize(32, 32, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = new Set();
    for (let i = 0; i < data.length; i += info.channels) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    lowColorGraphic = colors.size < 40;
  } catch {
    // segue com o perfil padrão se a amostragem de cor falhar
  }
  if (realTransparency) return { quality: 90, nearLossless: true, meta, reason: "transparencia_real" };
  if (hasAlpha || lowColorGraphic) return { quality: QUALITY_HIGH, meta, reason: hasAlpha ? "alpha_opaco" : "poucas_cores" };
  return { quality: QUALITY_PHOTO, meta, reason: "foto" };
}

/** Sobe `buf` em `key` (se ainda não existir válido no R2) e valida leitura de volta + URL pública + formato esperado. */
async function uploadAndValidate({ key, buf, contentType, expectWebp, expectDims }) {
  const head = await r2Head(key);
  if (head.exists) {
    const existing = await r2Get(key);
    if (expectWebp) {
      const existingMeta = await sharp(existing).metadata();
      if (existingMeta.format === "webp" && existingMeta.width === expectDims.width && existingMeta.height === expectDims.height && existing.length > 0) {
        return { reused: true, bytes: existing.length };
      }
      return { error: "objeto .webp já existe no R2 mas não bate (dimensões/formato) — não sobrescrito" };
    }
    if (sha256(existing) === sha256(buf) && existing.length === buf.length) {
      return { reused: true, bytes: existing.length };
    }
    return { error: "objeto já existe no R2 com conteúdo diferente — não sobrescrito" };
  }

  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buf, ContentType: contentType }));

  const readback = await r2Get(key);
  if (readback.length !== buf.length || sha256(readback) !== sha256(buf)) {
    return { error: "leitura de volta do R2 não bate com o que foi enviado" };
  }
  const pub = await fetchBufferRetry(`${R2_PUBLIC_BASE}/${key}`);
  if (!pub.ok) {
    return { error: `URL pública não respondeu 200 (HTTP ${pub.status})` };
  }
  if (sha256(pub.buffer) !== sha256(buf)) {
    return { error: "conteúdo da URL pública não bate com o que foi enviado" };
  }
  const pubFormat = detectActualFormat(pub.buffer);
  if (expectWebp && pubFormat !== "image/webp") {
    return { error: `URL pública não serve um WebP válido (detectado: ${pubFormat})` };
  }
  if (!expectWebp && pubFormat !== detectActualFormat(buf)) {
    return { error: `URL pública não serve o formato esperado (detectado: ${pubFormat})` };
  }
  return { reused: false, bytes: buf.length };
}

async function processOne(item, { commit, logStream }) {
  const record = { id: item.id, storagePath: item.storagePath, year: item.year };
  try {
    const dl = await fetchBufferRetry(`${SUPABASE_PUBLIC_BASE}/${item.storagePath}`);
    if (!dl.ok) {
      record.status = "error";
      record.reason = `download Supabase falhou (HTTP ${dl.status})`;
      return record;
    }
    const orig = dl.buffer;
    record.origBytes = orig.length;
    const realFormat = detectActualFormat(orig);
    record.realFormat = realFormat;

    if (!realFormat) {
      record.status = "corrupted";
      record.reason = "assinatura binária não reconhecida — registro não alterado";
      return record;
    }

    let finalKey = item.storagePath;
    let finalBuf = orig;
    let finalContentType = realFormat;
    let expectWebp = false;
    let expectDims = null;

    if (realFormat === "image/gif") {
      record.decision = "kept_gif";
    } else if (realFormat === "image/webp") {
      record.decision = "kept_native_webp";
    } else {
      const profile = await chooseProfile(orig);
      const webpBuf = await sharp(orig, { animated: false })
        .webp({ quality: profile.quality, effort: 4, nearLossless: Boolean(profile.nearLossless) })
        .toBuffer();
      const webpMeta = await sharp(webpBuf).metadata();

      if (webpMeta.width !== profile.meta.width || webpMeta.height !== profile.meta.height || webpBuf.length <= 0) {
        record.status = "error";
        record.reason = "conversão WebP falhou validação local (dimensões ou tamanho zero) — original preservado, registro não alterado";
        return record;
      }

      const savingPct = Number((100 * (1 - webpBuf.length / orig.length)).toFixed(1));
      record.savingPct = savingPct;
      record.profile = profile.reason;
      record.quality = profile.quality;

      if (savingPct < 5) {
        record.decision = "kept_low_saving";
      } else {
        record.decision = "converted";
        finalKey = webpKeyFor(item.storagePath);
        finalBuf = webpBuf;
        finalContentType = "image/webp";
        expectWebp = true;
        expectDims = { width: webpMeta.width, height: webpMeta.height };
      }
    }

    record.finalKey = finalKey;
    record.finalBytes = finalBuf.length;

    if (!commit) {
      record.status = "would_" + record.decision;
      return record;
    }

    const up = await uploadAndValidate({ key: finalKey, buf: finalBuf, contentType: finalContentType, expectWebp, expectDims });
    if (up.error) {
      record.status = "error";
      record.reason = up.error;
      return record;
    }
    record.reused = up.reused;

    const newPublicUrl = `${R2_PUBLIC_BASE}/${finalKey}`;
    const patch = { storage_provider: "r2", storage_path: finalKey, public_url: newPublicUrl };
    if (expectWebp && item.fileName && /\.[a-z0-9]+$/i.test(item.fileName)) {
      patch.file_name = item.fileName.replace(/\.[a-z0-9]+$/i, ".webp");
    }

    let updateError = null;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const res = await sb.from("media_assets").update(patch).eq("id", item.id);
      updateError = res.error;
      if (!updateError) break;
      if (attempt < 4) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    if (updateError) {
      record.status = "error";
      record.reason = `upload no R2 OK, mas update media_assets falhou após 4 tentativas (arquivo final já está validado no R2, pode retomar): ${updateError.message}`;
      return record;
    }

    record.status = record.decision;
    return record;
  } catch (e) {
    record.status = "error";
    record.reason = e.message;
    return record;
  } finally {
    if (logStream) logStream.write(JSON.stringify(record) + "\n");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Migração direta 2026 (Supabase -> R2) · commit=${args.commit} · concurrency=${args.concurrency}${args.limit ? ` · limit=${args.limit}` : ""}`);
  console.log(`Qualidade: foto=${QUALITY_PHOTO} alta=${QUALITY_HIGH} transparência-real=90(near-lossless) · economia mínima=5%`);

  console.log("Carregando mídias de 2026 pendentes (storage_provider=supabase)...");
  let targets = await fetchPending2026();
  console.log(`Total pendente em 2026: ${targets.length}`);
  if (args.limit > 0) {
    targets = targets.slice(0, args.limit);
    console.log(`Preflight: limitando a ${targets.length} item(ns).`);
  }
  if (targets.length === 0) {
    console.log("Nada a fazer — todas as mídias de 2026 já estão em storage_provider=r2.");
    return;
  }

  const run = createPool(args.concurrency);
  const logPath = path.join(OUTPUT_DIR, `migrate-2026-direct-${args.commit ? "commit" : "dry-run"}.jsonl`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const tally = {};
  let bytesOrig = 0;
  let bytesFinal = 0;
  let done = 0;
  const errors = [];

  await Promise.all(
    targets.map((item) =>
      run(async () => {
        const r = await processOne(item, { commit: args.commit, logStream });
        done += 1;
        tally[r.status] = (tally[r.status] || 0) + 1;
        if (r.origBytes) bytesOrig += r.origBytes;
        if (r.finalBytes) bytesFinal += r.finalBytes;
        if (r.status === "error" || r.status === "corrupted") errors.push({ id: r.id, storagePath: r.storagePath, reason: r.reason });
        if (done % 250 === 0 || done === targets.length) {
          console.log(`  ${done}/${targets.length} — ${JSON.stringify(tally)}`);
        }
      }),
    ),
  );

  logStream.end();
  console.log("\n=== RESUMO ===");
  console.log("tally:", JSON.stringify(tally, null, 2));
  console.log("bytes originais somados:", bytesOrig, `(${(bytesOrig / 1024 / 1024).toFixed(1)} MB)`);
  if (args.commit) console.log("bytes finais somados:", bytesFinal, `(${(bytesFinal / 1024 / 1024).toFixed(1)} MB)`);
  if (errors.length > 0) {
    console.log(`\nREGISTROS NÃO ALTERADOS (erro — Supabase intacto, pode retomar):`);
    for (const e of errors) console.log(`   - [${e.id}] ${e.storagePath}: ${e.reason}`);
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `migrate-2026-direct-${args.commit ? "commit" : "dry-run"}-summary.json`),
    JSON.stringify({ commit: args.commit, total: targets.length, tally, bytesOrig, bytesFinal, errors }, null, 2),
  );
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
