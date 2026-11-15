import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../.next/server/app/sistema/nfse", import.meta.url));

function findTraces(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = join(dir, item.name);
    if (item.isDirectory()) return findTraces(full);
    return item.isFile() && item.name.endsWith(".nft.json") ? [full] : [];
  });
}
const files = findTraces(root);
assert.ok(files.length > 0, "Build Next não gerou manifestos nft para as rotas NFS-e.");
const allTraced = files.flatMap((p) => {
  const manifest = JSON.parse(readFileSync(p, "utf8"));
  assert.ok(Array.isArray(manifest.files), "Manifesto trace sem files: " + relative(root, p));
  return manifest.files;
});
for (const name of ["DPS_v1.01.xsd", "NFSe_v1.01.xsd", "pedRegEvento_v1.01.xsd", "tiposComplexos_v1.01.xsd", "tiposSimples_v1.01.xsd", "xmldsig-core-schema.xsd"]) {
  assert.ok(
    allTraced.some((p) => p.includes("prodrest-v1.01-20261020") && p.endsWith("/" + name)),
    "XSD obrigatório ausente dos manifests do build fiscal: " + name,
  );
}
console.log("NFS-e: XSDs oficiais rastreados no build real (sem emissão ou deploy).");
