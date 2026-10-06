// Motor de importação/reconciliação compartilhado entre migrate.mjs (lotes
// históricos) e sync-recent.mjs (sincronização incremental) — extraído do
// migrate.mjs original (Fase 35) para que os dois nunca divirjam na regra
// de criação de matéria, upload de imagem pro R2 e idempotência. Nenhuma
// mudança de comportamento em relação ao migrate.mjs original: só
// parametrizado (imageExceptionsFile deixou de ser um const de módulo fixo
// no batchDir do lote).
import { appendFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { normalizeUrl, stableSlug, sourceHash, PROVIDER } from "./identity.mjs";
import { CATEGORY_TO_SECTION_SLUG } from "./batches.mjs";
import { parseBrDateTime, toPublishedAtIso } from "./dates.mjs";
import { collectImageRefs } from "./pipeline.mjs";

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY precisam estar no ambiente para gravar de verdade.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

function detectActualFormat(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buf.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brands = buf.subarray(8, Math.min(buf.length, 64)).toString("ascii");
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
  return null;
}

function extForMime(mime) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/bmp": "bmp",
  }[mime] || "bin";
}

async function chooseR2Profile(buf) {
  const meta = await sharp(buf).metadata();
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
    const { data, info } = await sharp(buf)
      .resize(32, 32, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const colors = new Set();
    for (let i = 0; i < data.length; i += info.channels) {
      colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    lowColorGraphic = colors.size < 40;
  } catch {
    // Se a amostragem falhar, usa o perfil padrão de fotografia.
  }

  if (realTransparency) return { quality: 90, nearLossless: true };
  if (hasAlpha || lowColorGraphic) return { quality: 92, nearLossless: false };
  return { quality: 78, nearLossless: false };
}

async function optimizeLegacyImageForR2(orig) {
  const realFormat = detectActualFormat(orig);
  if (!realFormat) throw new Error("assinatura binária de imagem não reconhecida");

  let finalBuf = orig;
  let finalMime = realFormat;
  let width = null;
  let height = null;

  if (realFormat === "image/gif" || realFormat === "image/webp") {
    try {
      const meta = await sharp(orig, { animated: realFormat === "image/gif" }).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // Metadata ausente não impede preservar GIF/WebP nativo.
    }
    return { finalBuf, finalMime, width, height };
  }

  try {
    const profile = await chooseR2Profile(orig);
    const webpBuf = await sharp(orig)
      .webp({ quality: profile.quality, effort: 4, nearLossless: profile.nearLossless })
      .toBuffer();
    const [origMeta, webpMeta] = await Promise.all([sharp(orig).metadata(), sharp(webpBuf).metadata()]);
    const savingPct = 100 * (1 - webpBuf.length / orig.length);
    width = origMeta.width ?? null;
    height = origMeta.height ?? null;

    if (
      webpBuf.length > 0 &&
      webpMeta.width === origMeta.width &&
      webpMeta.height === origMeta.height &&
      savingPct >= 5
    ) {
      finalBuf = webpBuf;
      finalMime = "image/webp";
      width = webpMeta.width ?? width;
      height = webpMeta.height ?? height;
    }
  } catch {
    // Se o codec falhar, preserva o original detectado em vez de perder a foto.
  }

  return { finalBuf, finalMime, width, height };
}

export async function uploadLegacyImageToR2(articleSlug, sortOrder, orig) {
  const { finalBuf, finalMime, width, height } = await optimizeLegacyImageForR2(orig);
  const storagePath = `legacy/${articleSlug}/${sortOrder}.${extForMime(finalMime)}`;
  const bucket = requiredEnv("R2_BUCKET");
  const publicBase = requiredEnv("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  const s3 = r2Client();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      Body: finalBuf,
      ContentType: finalMime,
    }),
  );

  const publicUrl = `${publicBase}/${storagePath}`;
  const check = await fetch(publicUrl, { cache: "no-store" }).catch(() => null);
  if (!check || !check.ok) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: storagePath })).catch(() => {});
    throw new Error(`R2 não respondeu 200 após upload: ${publicUrl}`);
  }

  return {
    storagePath,
    publicUrl,
    fileName: storagePath.split("/").pop(),
    mimeType: finalMime,
    width,
    height,
  };
}

export async function downloadImage(url, { retries = 3, timeoutMs = 20000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, status: res.status };
      const contentType = res.headers.get("content-type") || "application/octet-stream";
      if (!contentType.startsWith("image/")) return { ok: false, status: 0, error: `mime inesperado: ${contentType}` };
      const buffer = Buffer.from(await res.arrayBuffer());
      return { ok: true, buffer, contentType };
    } catch (error) {
      clearTimeout(timer);
      if (attempt === retries) return { ok: false, status: 0, error: String(error) };
    }
  }
  return { ok: false, status: 0, error: "retries exhausted" };
}

export async function resolveSectionId(sb, slug, sectionCache) {
  if (sectionCache.has(slug)) return sectionCache.get(slug);
  const { data, error } = await sb.from("editorial_sections").select("id").eq("slug", slug).single();
  if (error || !data) throw new Error(`Editoria não encontrada para slug=${slug}: ${error?.message}`);
  sectionCache.set(slug, data.id);
  return data.id;
}

export async function resolveGeralLocalityId(sb) {
  const { data, error } = await sb.from("localities").select("id").eq("slug", "geral").single();
  if (error || !data) throw new Error(`Localidade "geral" não encontrada: ${error?.message}`);
  return data.id;
}

export async function findExistingArticleId(sb, identity) {
  let query = sb.from("article_external_sources").select("article_id").eq("provider", PROVIDER);
  if (identity.externalId) query = query.eq("external_id", identity.externalId);
  else query = query.eq("source_url", identity.normalizedUrl);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.article_id ?? null;
}

/**
 * Reconcilia as imagens esperadas de UMA matéria contra o que já existe no
 * banco — nunca duplica: só copia/reutiliza o que ainda falta.
 * `imageExceptionsFile` é o arquivo .ndjson onde falhas de imagem são
 * registradas (cada chamador passa o seu próprio caminho de output).
 */
export async function reconcileArticleImages(sb, articleId, expectedRefs, { articleSlug, throttle, log, dryRun, imageExceptionsFile }) {
  const outcome = { uploaded: 0, reused: 0, alreadyLinked: 0, corrected: 0, failed: 0 };
  if (dryRun) return outcome;

  const { data: existingLinks, error: linksErr } = await sb
    .from("article_media")
    .select("id, media_id, role, sort_order, media_assets(origin_source_url)")
    .eq("article_id", articleId);
  if (linksErr) throw linksErr;

  const linkByNormalizedUrl = new Map(
    (existingLinks ?? []).filter((l) => l.media_assets?.origin_source_url).map((l) => [l.media_assets.origin_source_url, l]),
  );

  for (let index = 0; index < expectedRefs.length; index += 1) {
    const ref = expectedRefs[index];
    const normalized = normalizeUrl(ref.src);
    const expectedRole = ref.role;
    const expectedSortOrder = index; // capa = 0 sempre, galeria na ordem original — nunca incremental pós-existentes.

    const existingLink = linkByNormalizedUrl.get(normalized);
    if (existingLink) {
      if (existingLink.role !== expectedRole || existingLink.sort_order !== expectedSortOrder) {
        const { error: updateErr } = await sb
          .from("article_media")
          .update({ role: expectedRole, sort_order: expectedSortOrder, caption_override: ref.caption || null, credit_override: ref.credit || null })
          .eq("id", existingLink.id);
        if (updateErr) throw updateErr;
        outcome.corrected += 1;
      } else {
        outcome.alreadyLinked += 1;
      }
      continue;
    }

    // Mídia pode já existir (baixada para OUTRA matéria) — reutilizar em
    // vez de baixar de novo (nunca copiar duas vezes a mesma imagem externa).
    const { data: existingMedia, error: findErr } = await sb.from("media_assets").select("id").eq("origin_source_url", normalized).maybeSingle();
    if (findErr) throw findErr;

    let mediaId = existingMedia?.id ?? null;
    if (mediaId) {
      outcome.reused += 1;
    } else {
      await throttle();
      const result = await downloadImage(ref.src);
      if (!result.ok) {
        if (imageExceptionsFile) {
          await appendFile(
            imageExceptionsFile,
            JSON.stringify({ articleSlug, url: ref.src, status: result.status, error: result.error, at: new Date().toISOString() }) + "\n",
            "utf8",
          );
        }
        log(`    [imagem falhou] ${ref.src} (${result.status || result.error})`);
        outcome.failed += 1;
        continue;
      }
      let uploaded;
      try {
        uploaded = await uploadLegacyImageToR2(articleSlug, expectedSortOrder, result.buffer);
      } catch (uploadError) {
        if (imageExceptionsFile) {
          await appendFile(
            imageExceptionsFile,
            JSON.stringify({ articleSlug, url: ref.src, error: String(uploadError), at: new Date().toISOString() }) + "\n",
            "utf8",
          );
        }
        log(`    [R2 falhou] ${ref.src}: ${String(uploadError)}`);
        outcome.failed += 1;
        continue;
      }

      const { data: media, error: insertErr } = await sb
        .from("media_assets")
        .insert({
          type: "image",
          file_name: uploaded.fileName,
          storage_provider: "r2",
          storage_path: uploaded.storagePath,
          public_url: uploaded.publicUrl,
          title: articleSlug,
          caption: ref.caption || null,
          credit: ref.credit || null,
          mime_type: uploaded.mimeType,
          width: uploaded.width,
          height: uploaded.height,
          origin_source_url: normalized,
        })
        .select("id")
        .single();
      if (insertErr) {
        // O objeto já foi enviado ao R2. Se o cadastro falhar, remove esse
        // objeto para nunca deixar órfão; em corrida 23505, reutiliza o
        // media_asset que venceu a disputa.
        try {
          const s3 = r2Client();
          await s3.send(new DeleteObjectCommand({ Bucket: requiredEnv("R2_BUCKET"), Key: uploaded.storagePath }));
        } catch {
          // A falha principal continua sendo a do banco; limpeza pode ser auditada depois.
        }

        if (insertErr.code === "23505") {
          const { data: raceMedia, error: raceErr } = await sb.from("media_assets").select("id").eq("origin_source_url", normalized).single();
          if (raceErr) throw raceErr;
          mediaId = raceMedia.id;
          outcome.reused += 1;
        } else {
          throw insertErr;
        }
      } else {
        mediaId = media.id;
        outcome.uploaded += 1;
      }
    }

    // Corrigir uma capa errada de uma execução anterior (nunca inserir uma
    // segunda — violaria o índice único de "1 capa por matéria").
    if (expectedRole === "cover") {
      const wrongCover = (existingLinks ?? []).find((l) => l.role === "cover" && l.media_id !== mediaId);
      if (wrongCover) {
        const { error: fixCoverErr } = await sb
          .from("article_media")
          .update({ media_id: mediaId, sort_order: expectedSortOrder, caption_override: ref.caption || null, credit_override: ref.credit || null })
          .eq("id", wrongCover.id);
        if (fixCoverErr) throw fixCoverErr;
        outcome.corrected += 1;
        continue;
      }
    }

    const { error: linkErr } = await sb.from("article_media").insert({
      article_id: articleId,
      media_id: mediaId,
      role: expectedRole,
      sort_order: expectedSortOrder,
      caption_override: ref.caption || null,
      credit_override: ref.credit || null,
    });
    if (linkErr) throw linkErr;
  }

  outcome.linkedTotal = outcome.uploaded + outcome.reused + outcome.alreadyLinked + outcome.corrected;
  return outcome;
}

/**
 * Cria (via RPC atômica) ou reencontra a matéria e SEMPRE reconcilia as
 * imagens — nunca pula uma matéria já existente sem checar se a mídia dela
 * está completa. `opts.imageExceptionsFile` é opcional (passa adiante pra
 * reconcileArticleImages).
 */
export async function importCandidate(sb, c, detail, opts) {
  const { sectionCache, localityId, throttle, log, dryRun, batchStats, imageExceptionsFile } = opts;
  const sectionSlug = CATEGORY_TO_SECTION_SLUG[c.primary.category];
  const slug = stableSlug(c.primary);
  const refs = detail ? collectImageRefs(detail) : [];

  const existingId = await findExistingArticleId(sb, c.identity);
  let articleId = existingId;
  let wasExisting = Boolean(existingId);

  if (dryRun) {
    log(`  [dry-run] ${wasExisting ? "reconciliaria" : "criaria"} matéria "${detail?.title || c.primary.title}" (${slug}) em ${sectionSlug}, imagens=${refs.length}`);
  } else if (!wasExisting) {
    const sectionId = await resolveSectionId(sb, sectionSlug, sectionCache);
    // Data/hora original preservada de verdade — nunca um horário
    // inventado. A precisão real (datetime vs. date_only) vai em
    // raw_metadata para nunca ficar escondida atrás do timestamp.
    const detailParsed = parseBrDateTime(detail?.publishedRaw) ?? { dateIso: c.publishedIso, time: null, precision: "date_only" };
    const publishedAtIso = toPublishedAtIso(detailParsed);
    const hash = sourceHash(c.primary, detail);

    const { data: newId, error: rpcErr } = await sb.rpc("legacy_import_article", {
      article: {
        slug,
        title: detail?.title || c.primary.title,
        subtitle: detail?.subtitle || null,
        body: detail?.bodyHtml || "",
        section_id: sectionId,
        locality_id: localityId,
        status: "published",
        origin: "legacy_site",
        published_at: publishedAtIso,
        author_name: detail?.sourceLabel || null,
      },
      source: {
        provider: PROVIDER,
        external_id: c.identity.externalId,
        source_url: c.identity.normalizedUrl,
        source_slug: c.primary.slug,
        original_category: c.primary.category,
        original_subcategory: c.primary.category.startsWith("colunistas/") ? c.primary.category.split("/")[1] : null,
        original_author: detail?.sourceLabel || null,
        original_published_at: publishedAtIso,
        source_hash: hash,
        raw_metadata: {
          allCategories: c.allCategories,
          listingTitle: c.primary.title,
          listingDateRaw: c.primary.listingDateRaw,
          datePrecision: detailParsed.precision,
        },
      },
    });
    if (rpcErr) throw rpcErr;
    articleId = newId;
  }

  if (!dryRun) {
    const imgOutcome = await reconcileArticleImages(sb, articleId, refs, { articleSlug: slug, throttle, log, dryRun, imageExceptionsFile });
    batchStats.uploadedImages += imgOutcome.uploaded;
    batchStats.reusedImages += imgOutcome.reused;
    batchStats.alreadyLinkedImages += imgOutcome.alreadyLinked;
    batchStats.correctedImages += imgOutcome.corrected;
    batchStats.failedImages += imgOutcome.failed;
  }

  if (wasExisting) batchStats.skippedExisting += 1;
  else batchStats.imported += 1;
  return { status: wasExisting ? "reconciled_existing" : "imported", articleId };
}
