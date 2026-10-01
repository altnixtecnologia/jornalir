#!/usr/bin/env node
// Otimização WebP do acervo já migrado pro R2 — bloco por bloco de anos.
// Nunca escreve/apaga no Supabase (originais de lá continuam como backup).
// Modos (sempre em cima do mesmo intervalo --from/--to):
//   --mode=dry-run             (padrão) só lê e projeta, nenhuma escrita
//   --mode=sample --commit     converte só a amostra estratificada (p/ inspeção visual)
//   --mode=convert --commit    converte TODO o elegível, sobe .webp novo no R2, NÃO mexe no banco
//   --mode=cutover --commit    atualiza media_assets pros itens com .webp já validado no R2
//   --mode=cleanup --commit    apaga do R2 o original antigo (jpg/png/bmp) só quando o .webp já está ativo no banco
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createPool, detectActualFormat, fetchBufferRetry, requireEnv, sha256, webpKeyFor } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function parseArgs(argv) {
  const args = { commit: false, concurrency: 4, mode: "dry-run", sampleSize: 15, qualityPhoto: 72, qualityHigh: 92 };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, "").split("=");
    if (key === "year") args.from = args.to = Number(value);
    else if (key === "from") args.from = Number(value);
    else if (key === "to") args.to = Number(value);
    else if (key === "commit") args.commit = true;
    else if (key === "mode") args.mode = value;
    else if (key === "concurrency") args.concurrency = Number(value);
    else if (key === "sample-per-year") args.sampleSize = Number(value);
    else if (key === "quality-photo") args.qualityPhoto = Number(value);
    else if (key === "quality-high") args.qualityHigh = Number(value);
  }
  if (!args.from || !args.to) {
    console.error("Uso: convert.mjs --from=2015 --to=2019 --mode=dry-run|sample|convert|cutover|cleanup [--commit] [--quality-photo=72] [--quality-high=92]");
    process.exit(1);
  }
  return args;
}

// Perfil de qualidade — configurável por bloco de anos via --quality-photo/--quality-high
// (bloco 2015-2019 validado com 72/92; bloco 2020-2024 usa 78/92 por pedido).
let QUALITY_PHOTO = 72;
let QUALITY_HIGH = 92;

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

async function r2Get(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return streamToBuffer(res.Body);
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

/** Mesmo esquema de join em 3 consultas planas usado na migração R2 (embed aninhado estoura statement_timeout em volume alto). */
async function fetchEligibleMedia(fromYear, toYear) {
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
  console.log("  carregando media_assets (storage_provider=r2)...");
  const assets = await fetchAll("media_assets", "id, storage_path, mime_type, file_name, storage_provider", (q) => q.eq("storage_provider", "r2"));

  return assets
    .map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      fileName: row.file_name,
      declaredMime: row.mime_type,
      year: yearByMedia.get(row.id) ?? null,
    }))
    .filter((r) => r.year !== null && r.year >= fromYear && r.year <= toYear && !r.storagePath.toLowerCase().endsWith(".webp"));
}

/**
 * Perfil de qualidade — QUALITY_PHOTO por padrão pra foto comum; imagem com
 * transparência real (alpha variando de verdade, não só um canal alpha
 * presente e 100% opaco — muito comum em PNG do acervo legado) ou poucas
 * cores dominantes (proxy simples pra "arte/texto/logo" — sem classificador
 * de ML, só contagem de cores num thumbnail 32x32) usa qualidade mais alta;
 * transparência REAL usa near-lossless (perde muito menos nas bordas do
 * canal alpha do que WebP lossy comum). GIF nunca chega aqui (filtrado
 * antes). QUALITY_PHOTO/QUALITY_HIGH configuráveis por bloco de anos.
 */
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
      // se a leitura de stats falhar, trata como transparência real por segurança (perfil mais alto)
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
    // se a amostragem de cor falhar por algum motivo, segue com o perfil padrão
  }
  if (realTransparency) return { quality: 90, nearLossless: true, meta, reason: "transparencia_real" };
  if (hasAlpha || lowColorGraphic) return { quality: QUALITY_HIGH, meta, reason: hasAlpha ? "alpha_opaco" : "poucas_cores" };
  return { quality: QUALITY_PHOTO, meta, reason: "foto" };
}

async function convertOne(item, { concurrency, logStream }) {
  const record = { id: item.id, storagePath: item.storagePath, year: item.year };
  try {
    const orig = await r2Get(item.storagePath);
    record.origBytes = orig.length;
    const realFormat = detectActualFormat(orig);
    record.realFormat = realFormat;

    if (!realFormat) {
      record.status = "corrupted";
      record.reason = "assinatura binária não reconhecida — não convertido";
      return record;
    }
    if (realFormat === "image/gif") {
      record.status = "kept_gif";
      return record;
    }
    if (realFormat === "image/webp") {
      record.status = "already_webp";
      return record;
    }

    const webpKey = webpKeyFor(item.storagePath);

    // Idempotência: se o .webp já existe no R2, valida e reaproveita em vez de reconverter.
    const head = await r2Head(webpKey);
    if (head.exists) {
      const existing = await r2Get(webpKey);
      const existingMeta = await sharp(existing).metadata();
      const origMeta = await sharp(orig).metadata();
      if (existingMeta.width === origMeta.width && existingMeta.height === origMeta.height && existing.length > 0) {
        record.status = "already_converted";
        record.webpBytes = existing.length;
        record.dims = `${existingMeta.width}x${existingMeta.height}`;
        return record;
      }
      // existe mas não bate — não sobrescreve silenciosamente, registra e para nesse item.
      record.status = "error";
      record.reason = "objeto .webp já existe no R2 mas dimensões não batem com o original — não sobrescrito";
      return record;
    }

    const profile = await chooseProfile(orig);
    const webpBuf = await sharp(orig, { animated: false })
      .webp({ quality: profile.quality, effort: 4, nearLossless: Boolean(profile.nearLossless) })
      .toBuffer();
    const webpMeta = await sharp(webpBuf).metadata();

    if (webpMeta.width !== profile.meta.width || webpMeta.height !== profile.meta.height) {
      record.status = "error";
      record.reason = `dimensões não preservadas (original ${profile.meta.width}x${profile.meta.height}, webp ${webpMeta.width}x${webpMeta.height})`;
      return record;
    }

    const savingPct = 100 * (1 - webpBuf.length / orig.length);
    record.origFormat = realFormat;
    record.webpBytes = webpBuf.length;
    record.savingPct = Number(savingPct.toFixed(1));
    record.profile = profile.reason;
    record.quality = profile.quality;
    record.dims = `${webpMeta.width}x${webpMeta.height}`;

    if (webpBuf.length <= 0) {
      record.status = "error";
      record.reason = "conversão gerou arquivo de tamanho zero";
      return record;
    }
    if (savingPct < 5) {
      record.status = "exception_low_saving";
      record.reason = `economia de só ${savingPct.toFixed(1)}% — original mantido, não convertido`;
      return record;
    }

    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: webpKey, Body: webpBuf, ContentType: "image/webp" }));

    // Valida: leitura de volta + URL pública + decodificação real
    const readback = await r2Get(webpKey);
    if (readback.length !== webpBuf.length || sha256(readback) !== sha256(webpBuf)) {
      record.status = "error";
      record.reason = "leitura de volta do .webp no R2 não bate com o que foi enviado";
      return record;
    }
    const pub = await fetchBufferRetry(`${R2_PUBLIC_BASE}/${webpKey}`);
    if (!pub.ok) {
      record.status = "error";
      record.reason = `URL pública do .webp não respondeu 200 (HTTP ${pub.status})`;
      return record;
    }
    if (sha256(pub.buffer) !== sha256(webpBuf)) {
      record.status = "error";
      record.reason = "conteúdo da URL pública do .webp não bate com o que foi enviado";
      return record;
    }
    const pubFormat = detectActualFormat(pub.buffer);
    if (pubFormat !== "image/webp") {
      record.status = "error";
      record.reason = `URL pública não serve um WebP válido (detectado: ${pubFormat})`;
      return record;
    }

    record.status = "converted";
    return record;
  } catch (e) {
    record.status = "error";
    record.reason = e.message;
    return record;
  } finally {
    if (logStream) logStream.write(JSON.stringify(record) + "\n");
  }
}

async function cutoverOne(item) {
  const webpKey = webpKeyFor(item.storagePath);
  const head = await r2Head(webpKey);
  if (!head.exists) return { id: item.id, status: "skip_no_webp" };

  // Revalida de novo antes do cutover (nunca confia cegamente em execução anterior).
  const webpBuf = await r2Get(webpKey);
  const webpMeta = await sharp(webpBuf).metadata();
  if (webpMeta.format !== "webp" || webpBuf.length === 0) {
    return { id: item.id, status: "error", reason: "revalidação falhou antes do cutover" };
  }

  const newPublicUrl = `${R2_PUBLIC_BASE}/${webpKey}`;
  const patch = { storage_path: webpKey, public_url: newPublicUrl };
  if (item.fileName && /\.[a-z0-9]+$/i.test(item.fileName)) {
    patch.file_name = item.fileName.replace(/\.[a-z0-9]+$/i, ".webp");
  }

  let updateError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await sb.from("media_assets").update(patch).eq("id", item.id);
    updateError = res.error;
    if (!updateError) break;
    if (attempt < 4) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  if (updateError) return { id: item.id, status: "error", reason: updateError.message };
  return { id: item.id, status: "updated", newStoragePath: webpKey };
}

async function cleanupOne(item) {
  // Só apaga o original se o banco JÁ estiver apontando pro .webp (cutover feito e revalidado).
  const { data, error } = await sb.from("media_assets").select("storage_path").eq("id", item.id).maybeSingle();
  if (error || !data) return { id: item.id, status: "error", reason: error?.message || "registro não encontrado" };
  if (!data.storage_path.endsWith(".webp") || data.storage_path !== webpKeyFor(item.storagePath)) {
    return { id: item.id, status: "skip_not_cutover" };
  }
  const head = await r2Head(item.storagePath);
  if (!head.exists) return { id: item.id, status: "skip_original_already_gone" };
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: item.storagePath }));
  return { id: item.id, status: "deleted_original", key: item.storagePath };
}

/**
 * Alvos do cleanup: NÃO reaproveita `fetchEligibleMedia` (aquele filtro é
 * "ainda não é .webp" — exatamente o oposto do que o cleanup precisa, já
 * que depois do cutover o storage_path passou a ser .webp; usar aquele
 * filtro aqui exclui silenciosamente tudo que já foi convertido, que é o
 * bug real encontrado nesta primeira tentativa: 9.250 itens elegíveis
 * viraram 0 candidatos, e os 97 restantes foram corretamente pulados por
 * nunca terem sido cortados pra .webp). A fonte de verdade aqui é o log
 * da conversão (`status:"converted"`), que registra o path ORIGINAL de
 * cada id antes do cutover — `cleanupOne` então confere de novo no banco
 * que aquele id realmente aponta pro .webp antes de apagar.
 */
function fetchCleanupTargets(fromYear, toYear) {
  const files = [`sample-${fromYear}-${toYear}.jsonl`, `convert-${fromYear}-${toYear}.jsonl`];
  const byId = new Map();
  for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const r = JSON.parse(line);
      if (r.status === "converted" && r.year >= fromYear && r.year <= toYear) {
        byId.set(r.id, { id: r.id, storagePath: r.storagePath, year: r.year });
      }
    }
  }
  return [...byId.values()];
}

function stratifiedSample(items, perYear) {
  const byYear = new Map();
  for (const item of items) {
    if (!byYear.has(item.year)) byYear.set(item.year, []);
    byYear.get(item.year).push(item);
  }
  const sample = [];
  for (const [, list] of byYear) {
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    sample.push(...shuffled.slice(0, perYear));
  }
  return sample;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  QUALITY_PHOTO = args.qualityPhoto;
  QUALITY_HIGH = args.qualityHigh;
  console.log(`Modo: ${args.mode} · commit=${args.commit} · anos ${args.from}-${args.to} · qualidade foto=${QUALITY_PHOTO} alta=${QUALITY_HIGH}`);

  let all;
  if (args.mode === "cleanup") {
    all = fetchCleanupTargets(args.from, args.to);
    console.log(`Candidatos a limpeza (convertidos com sucesso nos logs): ${all.length}`);
  } else {
    console.log("Carregando mídias elegíveis (storage_provider=r2, ainda não .webp)...");
    all = await fetchEligibleMedia(args.from, args.to);
    console.log(`Total elegível no intervalo: ${all.length}`);
  }

  const run = createPool(args.concurrency);
  const logPath = path.join(OUTPUT_DIR, `${args.mode}-${args.from}-${args.to}.jsonl`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  let targets = all;
  if (args.mode === "sample") targets = stratifiedSample(all, args.sampleSize);

  const tally = {};
  const bytesByRealFormat = {};
  let done = 0;

  if (args.mode === "dry-run" || args.mode === "sample" || args.mode === "convert") {
    await Promise.all(
      targets.map((item) =>
        run(async () => {
          let r;
          if (args.mode === "dry-run") {
            // dry-run: baixa e classifica, mas nunca escreve no R2
            const orig = await r2Get(item.storagePath);
            const fmt = detectActualFormat(orig) || "unknown";
            r = { status: `dry_${fmt}`, origBytes: orig.length, realFormat: fmt };
            logStream.write(JSON.stringify({ id: item.id, storagePath: item.storagePath, year: item.year, ...r }) + "\n");
          } else {
            r = await convertOne(item, { concurrency: args.concurrency, logStream });
          }
          done += 1;
          tally[r.status] = (tally[r.status] || 0) + 1;
          const fmtKey = r.realFormat || "unknown";
          bytesByRealFormat[fmtKey] = (bytesByRealFormat[fmtKey] || 0) + (r.origBytes || 0);
          if (done % 200 === 0 || done === targets.length) {
            console.log(`  ${done}/${targets.length} — ${JSON.stringify(tally)}`);
          }
        }),
      ),
    );
  } else if (args.mode === "cutover") {
    for (const item of targets) {
      const r = await cutoverOne(item);
      tally[r.status] = (tally[r.status] || 0) + 1;
      logStream.write(JSON.stringify(r) + "\n");
      done += 1;
      if (done % 200 === 0 || done === targets.length) console.log(`  cutover ${done}/${targets.length} — ${JSON.stringify(tally)}`);
    }
  } else if (args.mode === "cleanup") {
    for (const item of targets) {
      const r = await cleanupOne(item);
      tally[r.status] = (tally[r.status] || 0) + 1;
      logStream.write(JSON.stringify(r) + "\n");
      done += 1;
      if (done % 200 === 0 || done === targets.length) console.log(`  cleanup ${done}/${targets.length} — ${JSON.stringify(tally)}`);
    }
  }

  logStream.end();
  console.log("\n=== RESUMO ===");
  console.log("tally:", JSON.stringify(tally, null, 2));
  console.log("bytesByRealFormat:", JSON.stringify(bytesByRealFormat, null, 2));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${args.mode}-${args.from}-${args.to}-summary.json`),
    JSON.stringify({ mode: args.mode, from: args.from, to: args.to, total: targets.length, tally, bytesByRealFormat }, null, 2),
  );
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
