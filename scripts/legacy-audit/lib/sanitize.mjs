import * as cheerio from "cheerio";

// Sanitização estritamente específica (Fase 44C) de um resíduo mecânico
// encontrado no CMS legado: um fragmento dos ÚLTIMOS atributos de uma tag
// <img> (`data-filename="retriever"`, `style="width: ...; height: ...;"`)
// sobrando como TEXTO literal dentro de um <p>/<h6>, sempre terminado pela
// entidade `&gt;` — nunca um `>` real. É exatamente esse `&gt;` escapado
// que prova ser resíduo de markup quebrado, não uma tag <img> de verdade
// (que fecharia com `>` real, nunca com a entidade). Confirmado por
// varredura local nos 4 lotes com cache disponível: 2015-2016 (0 casos),
// 2017-2018 (0 casos), 2019-2020 (203 casos, lote já importado — não
// tocado nesta etapa), 2021-2022 (160 casos, todos cobertos por este
// padrão, 0 falso-positivo nos milhares de artigos sem o vazamento).
const ATTR = String.raw`(?:data-filename="retriever"|style="[a-zA-Z0-9"'=.,;:\-%\s]*")`;
export const IMG_ATTR_RESIDUE = new RegExp(ATTR + String.raw`(?:\s+` + ATTR + String.raw`)*\s*&gt;`, "gi");

/**
 * Remove o resíduo do HTML do corpo. Não remove nenhum outro texto —
 * o padrão só casa com a sequência exata de atributos de imagem seguida
 * da entidade `&gt;` literal, nunca com um `>` real de fechamento de tag.
 */
export function sanitizeBodyHtml(html) {
  if (!html) return { html, removedCount: 0 };
  let removedCount = 0;
  const sanitized = html.replace(IMG_ATTR_RESIDUE, () => {
    removedCount += 1;
    return "";
  });
  return { html: sanitized, removedCount };
}

/** Recalcula bodyParagraphCount/bodyTextLength/bodyTextSample/bodyTextFull
 * a partir de um bodyHtml (já sanitizado), usando a MESMA lógica de
 * extração de texto de `parseArticlePage` — para reprocessar cache
 * existente sem precisar refazer o fetch da página original. */
export function recomputeBodyTextFromHtml(bodyHtml) {
  const $ = cheerio.load(`<div id="root">${bodyHtml ?? ""}</div>`);
  const root = $("#root");
  const bodyParagraphs = [];
  root.find("p").each((_, p) => {
    const text = $(p).text().replace(/\s+/g, " ").trim();
    if (text) bodyParagraphs.push(text);
  });
  return {
    bodyHtml: root.html()?.trim() || null,
    bodyParagraphCount: bodyParagraphs.length,
    bodyTextLength: bodyParagraphs.join(" ").length,
    bodyTextSample: bodyParagraphs.join(" ").slice(0, 500) || null,
    bodyTextFull: root.text().replace(/\s+/g, " ").trim(),
  };
}
