// Fase 44C — reprocessa o cache já existente de UM lote aplicando a nova
// sanitização de resíduo de <img> quebrada (lib/sanitize.mjs), SEM nenhum
// fetch de rede: lê output/batches/<batch>/details.ndjson, recalcula
// bodyHtml/bodyTextFull/bodyParagraphCount/bodyTextLength/bodyTextSample a
// partir do bodyHtml já em cache, e regrava o mesmo arquivo (mesma
// quantidade de linhas/keys, só os campos derivados de texto mudam nos
// artigos afetados). Uso: node reprocess-cache-html-leak.mjs --batch=2021-2022
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeBodyHtml, recomputeBodyTextFromHtml } from "./lib/sanitize.mjs";

const AUDIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const BATCH = args.batch;
if (!BATCH) throw new Error("uso: --batch=<key>");

const detailCacheFile = path.join(AUDIT_DIR, "output", "batches", BATCH, "details.ndjson");

const raw = await readFile(detailCacheFile, "utf8");
const lines = raw.split("\n").filter((l) => l.trim());

let changed = 0;
let totalResidueRemoved = 0;
const outLines = [];
for (const line of lines) {
  const row = JSON.parse(line);
  const detail = row.detail;
  if (detail?.bodyHtml) {
    const { html: sanitizedHtml, removedCount } = sanitizeBodyHtml(detail.bodyHtml);
    if (removedCount > 0) {
      const recomputed = recomputeBodyTextFromHtml(sanitizedHtml);
      Object.assign(detail, recomputed, { htmlResidueRemoved: removedCount });
      changed += 1;
      totalResidueRemoved += removedCount;
    }
  }
  outLines.push(JSON.stringify({ key: row.key, detail }));
}

await writeFile(detailCacheFile, outLines.join("\n") + "\n", "utf8");

console.log(`Lote ${BATCH}: ${lines.length} entradas no cache, ${changed} reprocessadas (sanitizadas), ${totalResidueRemoved} fragmento(s) de resíduo removido(s) no total.`);
