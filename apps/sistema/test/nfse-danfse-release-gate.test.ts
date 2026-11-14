import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DANFSE_OFFICIAL_LAYOUT_APPROVED,
  assertDanfseLayoutApproved,
  DanfseOfficialLayoutNotApprovedError,
} from "../src/lib/nfse/danfseReleaseGate";

const src = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("DANFSe de producao nao pode ser liberado com env nem por engano", () => {
  assert.equal(DANFSE_OFFICIAL_LAYOUT_APPROVED, false);
  for (const envValue of [undefined, "true", "false"]) {
    const prev = process.env.DANFSE_OFFICIAL_LAYOUT_APPROVED;
    if (envValue === undefined) delete process.env.DANFSE_OFFICIAL_LAYOUT_APPROVED;
    else process.env.DANFSE_OFFICIAL_LAYOUT_APPROVED = envValue;
    try {
      assert.throws(
        () => assertDanfseLayoutApproved(false),
        DanfseOfficialLayoutNotApprovedError,
      );
    } finally {
      if (prev === undefined) delete process.env.DANFSE_OFFICIAL_LAYOUT_APPROVED;
      else process.env.DANFSE_OFFICIAL_LAYOUT_APPROVED = prev;
    }
  }
});

test("prototipo de teste permanece disponivel apenas para homologacao visual", () => {
  assert.doesNotThrow(() => assertDanfseLayoutApproved(true));
});

test("gerador bloqueia antes de criar o PDF e rota verifica inclusive PDF arquivado", () => {
  const pdf = src("lib/nfse/danfsePdf.ts");
  const route = src("app/sistema/nfse/notas/[id]/danfse/route.ts");
  assert.match(pdf, /assertDanfseLayoutApproved\(data\.isHomologation\)/);
  assert.ok(
    pdf.indexOf("assertDanfseLayoutApproved(data.isHomologation)") <
      pdf.indexOf("PDFDocument.create()"),
    "nao criar PDF antes da verificacao de conformidade",
  );
  assert.match(route, /assertDanfseLayoutApproved\(note\.environment === "homologation"\)/);
  assert.match(route, /DanfseOfficialLayoutNotApprovedError/);
  assert.ok(
    route.indexOf("assertDanfseLayoutApproved(note.environment") <
      route.indexOf("readNfseDocument(original.r2_key"),
    "a rota nao pode servir PDF arquivado antes do gate",
  );
});
