import crypto from "node:crypto";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Semáforo simples — concorrência moderada, nunca ilimitada. */
export function createPool(concurrency) {
  let active = 0;
  const queue = [];
  function next() {
    if (active >= concurrency || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  }
  return function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Detecta o formato REAL pela assinatura binária — nunca confia só na extensão (achado real da migração anterior: parte dos ".jpg" do acervo é PNG/BMP puro por dentro). */
export function detectActualFormat(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buf.slice(0, 3).toString() === "GIF") return "image/gif";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "image/webp";
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
  return null;
}

export function extFor(mime) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/bmp": "bmp" }[mime] || "bin";
}

export function webpKeyFor(storagePath) {
  const dot = storagePath.lastIndexOf(".");
  const base = dot === -1 ? storagePath : storagePath.slice(0, dot);
  return `${base}.webp`;
}

/** GET com retry — trata 429/5xx como transitório (mesma lição da migração R2 anterior). */
export async function fetchBufferRetry(url, { retries = 5, timeoutMs = 30000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const retryable = [429, 502, 503, 504, 520].includes(res.status);
        if (retryable && attempt < retries) {
          await sleep(600 * attempt);
          continue;
        }
        return { ok: false, status: res.status, buffer: null };
      }
      const arrayBuf = await res.arrayBuffer();
      return { ok: true, status: res.status, buffer: Buffer.from(arrayBuf) };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(400 * attempt);
    }
  }
  return { ok: false, status: 0, buffer: null, error: String(lastError) };
}

export function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Faltam variáveis de ambiente (--env-file): ${missing.join(", ")}`);
    process.exit(1);
  }
}
