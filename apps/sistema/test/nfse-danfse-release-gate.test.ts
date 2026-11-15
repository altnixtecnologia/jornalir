import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatDanfseDate, formatDanfseDateTime } from "../src/lib/nfse/danfsePdf";
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

test("DANFSe: competencia nao pode mudar de dia por timezone do servidor", () => {
  assert.equal(formatDanfseDate("2026-10-01"), "01/10/2026");
  assert.equal(formatDanfseDate("2026-02-30"), "-");
  assert.equal(formatDanfseDate("2026-02-29"), "-");
  assert.equal(formatDanfseDate("2024-02-29"), "29/02/2024");
  assert.equal(formatDanfseDate(""), "-");
});

test("DANFSe: emissão segue horario de SC, inclusive Vercel UTC", () => {
  assert.equal(formatDanfseDateTime("2026-10-25T15:30:45Z"), "25/10/2026 12:30:45");
  assert.equal(formatDanfseDateTime("2026-10-25T12:30:45-03:00"), "25/10/2026 12:30:45");
  assert.equal(formatDanfseDateTime("2026-10-26T01:30:45Z"), "25/10/2026 22:30:45");
  assert.equal(formatDanfseDateTime("not-a-date"), "-");
});

test("DANFSe de homologacao inclui blocos fiscais nacionais sem liberar documento oficial", () => {
  const pdf = src("lib/nfse/danfsePdf.ts");
  const xml = readFileSync(new URL("../../../packages/core/src/nfse/danfse-data.ts", import.meta.url), "utf8");
  for (const section of ["Tributação Federal (Exceto CBS)", "Tributação IBS / CBS", "Informações Complementares"]) {
    assert.ok(pdf.includes(section), section);
  }
  for (const field of ["federalIrrf", "federalSocialSecurityRetained", "federalSocialContribRetained", "ibsCbsBase", "ibsCbsTotal", "grossTotalWithIbsCbs", "complementaryInformation", "discountConditional"]) {
    assert.ok(pdf.includes("data." + field), "PDF não lê " + field);
    assert.ok(xml.includes(field + ":"), "campo " + field + " não é extraído do XML");
  }
  assert.match(pdf, /DANFSe de homologação excede a área útil A4/);
  assert.match(pdf, /assertDanfseLayoutApproved\(data\.isHomologation\)/);
  assert.equal(DANFSE_OFFICIAL_LAYOUT_APPROVED, false);
});
