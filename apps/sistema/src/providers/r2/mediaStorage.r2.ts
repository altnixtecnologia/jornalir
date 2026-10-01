import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

const QUALITY_PHOTO = 78;
const QUALITY_HIGH = 92;
const MIN_SAVING_PCT = 5;

export class InvalidImageUploadError extends Error {}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function r2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

function sanitizeBaseName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = (lastDot > 0 ? name.slice(0, lastDot) : name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "foto";
}

/** Detecta o formato REAL pela assinatura binária — nunca confia só no MIME declarado pelo navegador (mesmo princípio usado em scripts/r2-webp-optimize/lib.mjs). */
function detectActualFormat(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buf.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  // AVIF usa o container ISO-BMFF: box `ftyp` + marca principal/compatível `avif` ou `avis`.
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brands = buf.subarray(8, Math.min(buf.length, 64)).toString("ascii");
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
  return null;
}

function extFor(mime: string): string {
  return (
    { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/bmp": "bmp" }[mime] ||
    "bin"
  );
}

/** Mesma heurística validada em scripts/r2-webp-optimize/convert.mjs (chooseProfile). */
async function chooseProfile(buf: Buffer): Promise<{ quality: number; nearLossless: boolean }> {
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
    const { data, info } = await sharp(buf).resize(32, 32, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += info.channels) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    lowColorGraphic = colors.size < 40;
  } catch {
    // segue com o perfil padrão se a amostragem de cor falhar
  }
  if (realTransparency) return { quality: 90, nearLossless: true };
  if (hasAlpha || lowColorGraphic) return { quality: QUALITY_HIGH, nearLossless: false };
  return { quality: QUALITY_PHOTO, nearLossless: false };
}

export interface OptimizedUploadResult {
  storagePath: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
}

/**
 * Processa e sobe uma imagem de upload DIRETO no R2 — nunca passa pelo
 * Supabase Storage. Converte pra WebP em memória quando há ganho real
 * (>=5%); GIF e WebP nativo vão como estão; formatos não reconhecidos pela
 * assinatura binária são rejeitados antes de qualquer upload. Só sobe o
 * arquivo final escolhido (nunca os dois).
 */
export async function uploadOptimizedImageToR2(file: File): Promise<OptimizedUploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new InvalidImageUploadError(
      `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB por foto.`,
    );
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    throw new InvalidImageUploadError(`Formato não aceito: ${file.type || "desconhecido"}. Use JPEG, PNG, WebP, AVIF ou GIF.`);
  }

  const orig = Buffer.from(await file.arrayBuffer());
  const realFormat = detectActualFormat(orig);
  if (!realFormat) {
    throw new InvalidImageUploadError("Arquivo não reconhecido como imagem válida (assinatura binária não corresponde a nenhum formato suportado).");
  }

  let finalBuf = orig;
  let finalMime = realFormat;
  let width: number | undefined;
  let height: number | undefined;

  if (realFormat === "image/gif" || realFormat === "image/webp") {
    // GIF: mantém (preserva animação). WebP nativo: não recomprime sem ganho real.
    try {
      const meta = await sharp(orig, { animated: realFormat === "image/gif" }).metadata();
      width = meta.width;
      height = meta.height;
    } catch {
      // sem metadata (ex.: gif muito simples) não é bloqueante
    }
  } else {
    const profile = await chooseProfile(orig);
    const webpBuf = await sharp(orig, { animated: false })
      .webp({ quality: profile.quality, effort: 4, nearLossless: profile.nearLossless })
      .toBuffer();
    const webpMeta = await sharp(webpBuf).metadata();
    const origMeta = await sharp(orig).metadata();
    const savingPct = 100 * (1 - webpBuf.length / orig.length);

    if (webpMeta.width === origMeta.width && webpMeta.height === origMeta.height && webpBuf.length > 0 && savingPct >= MIN_SAVING_PCT) {
      finalBuf = webpBuf;
      finalMime = "image/webp";
      width = webpMeta.width;
      height = webpMeta.height;
    } else {
      // economia insuficiente (ou conversão inválida) — mantém original
      width = origMeta.width;
      height = origMeta.height;
    }
  }

  const uuid = crypto.randomUUID();
  const baseName = sanitizeBaseName(file.name);
  const fileName = `${baseName}.${extFor(finalMime)}`;
  const storagePath = `${uuid}/${fileName}`;

  const bucket = requiredEnv("R2_BUCKET");
  const publicBase = requiredEnv("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  const s3 = r2Client();

  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: storagePath, Body: finalBuf, ContentType: finalMime }));

  const publicUrl = `${publicBase}/${storagePath}`;
  const check = await fetch(publicUrl, { cache: "no-store" }).catch(() => null);
  if (!check || !check.ok) {
    await deleteObjectFromR2(storagePath).catch(() => {});
    throw new Error(`Upload para R2 não pôde ser validado (URL pública não respondeu 200): ${publicUrl}`);
  }

  return { storagePath, publicUrl, fileName, mimeType: finalMime, width, height };
}

/** Remove um objeto do R2 — usado para desfazer o upload se o cadastro em media_assets falhar logo em seguida (evita órfão). */
export async function deleteObjectFromR2(key: string): Promise<void> {
  const bucket = requiredEnv("R2_BUCKET");
  const s3 = r2Client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
