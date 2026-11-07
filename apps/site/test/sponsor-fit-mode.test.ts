import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SITE_AD_DEFAULT_FIT_MODE,
  SITE_AD_FIT_MODE_LABELS,
  SITE_AD_FIT_MODES,
  normalizeSiteAdFitMode,
  type PublicSiteAdMedia,
  type SiteAdFitMode,
} from "@ir/types";
import { adFitClassName } from "../src/components/site/adSlots";
import { buildSponsorPool, buildSponsorPositions } from "../src/components/site/sponsorConveyor";

// Formato individual de cada imagem de patrocinador (decisão do usuário 07/11/2026):
// Esticar (padrão) / Encaixar / Preencher.

function media(id: string, fitMode: unknown): PublicSiteAdMedia {
  return {
    slotNumber: 1,
    id,
    imageUrl: `/${id}.webp`,
    sortOrder: 0,
    rotationIntervalMs: 10000,
    transitionEffect: "fade",
    fitMode: fitMode as SiteAdFitMode,
  };
}

test("três formatos, nesta ordem, com os rótulos do painel; padrão é Esticar", () => {
  assert.deepEqual([...SITE_AD_FIT_MODES], ["stretch", "contain", "cover"]);
  assert.deepEqual(SITE_AD_FIT_MODE_LABELS, { stretch: "Esticar", contain: "Encaixar", cover: "Preencher" });
  assert.equal(SITE_AD_DEFAULT_FIT_MODE, "stretch");
});

test("cada formato vira a sua própria classe CSS", () => {
  assert.equal(adFitClassName("stretch"), "ad-slot-img--stretch");
  assert.equal(adFitClassName("contain"), "ad-slot-img--contain");
  assert.equal(adFitClassName("cover"), "ad-slot-img--cover");
});

test("imagem antiga sem formato próprio (ou valor desconhecido) continua em Esticar", () => {
  for (const legacy of [undefined, null, "", "fill", "CONTAIN", 42]) {
    assert.equal(normalizeSiteAdFitMode(legacy), "stretch", String(legacy));
    assert.equal(adFitClassName(legacy as string), "ad-slot-img--stretch");
  }
});

test("o formato acompanha o patrocinador na fila (não depende da posição)", () => {
  const pool = buildSponsorPool(new Map([[1, [media("a", "cover"), media("b", "contain"), media("c", "stretch"), media("d", null)]]]));
  assert.deepEqual(pool.map((item) => [item.id, item.fitMode]), [["a", "cover"], ["b", "contain"], ["c", "stretch"], ["d", "stretch"]]);
  // As 6 posições recebem a mesma fila, com o formato de cada imagem intacto.
  for (const position of buildSponsorPositions(pool)) {
    assert.deepEqual(position.creatives.map((item) => item.fitMode), ["cover", "contain", "stretch", "stretch"]);
  }
});

test("CSS: as classes de formato vêm depois de todas as regras .ad-slot-img e cada uma usa o object-fit certo", () => {
  const css = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
    const match = new RegExp(escaped + "\\s*\\{([^}]*)\\}").exec(css);
    assert.ok(match, `regra ${selector} ausente`);
    return { body: match[1], index: match.index };
  };
  const stretch = rule(".ad-slot-img--stretch");
  const contain = rule(".ad-slot-img--contain");
  const cover = rule(".ad-slot-img--cover");
  assert.match(stretch.body, /object-fit:\s*fill/);
  assert.match(contain.body, /object-fit:\s*contain/);
  assert.match(cover.body, /object-fit:\s*cover/);
  assert.match(cover.body, /object-position:\s*center/);
  const lastBaseRule = css.lastIndexOf(".ad-slot-img {");
  assert.ok(lastBaseRule >= 0);
  assert.ok(Math.min(stretch.index, contain.index, cover.index) > lastBaseRule, "uma regra .ad-slot-img depois das classes de formato anularia a escolha da imagem");
  // A base continua Esticar: imagem sem classe de formato nunca encolhe.
  const baseBody = /\.ad-slot-img \{([^}]*)\}/g;
  let lastBase = "";
  for (let m = baseBody.exec(css); m; m = baseBody.exec(css)) lastBase = m[1];
  assert.match(lastBase, /object-fit:\s*fill/);
});

test("quadro do patrocinador segue 7:10 em todas as posições (desktop e pares do celular)", () => {
  const css = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
  assert.match(css, /\.ad-slot-unit,\s*\n\.ad-slot-unit--compact\s*\{\s*aspect-ratio:\s*7 \/ 10;/);
});
