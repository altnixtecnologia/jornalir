// Barreira de integridade editorial (Fase 35). Nenhuma matéria é
// considerada "eligible" (apta à carga automática) a menos que título,
// data, corpo e imagens venham EXCLUSIVAMENTE da estrutura própria da
// página de matéria — nunca de menu, publicidade, relacionadas, rodapé
// ou sidebar. Qualquer ambiguidade vira `needs_review`, nunca é
// descartada nem importada às cegas.

import { parseBrDateTime } from "./dates.mjs";

const TRUSTED_IMAGE_HOST = /suitacdn\.cloud-bricks\.net/i;

// Categorias em quarentena editorial (item 7, Fase 35B) — nunca elegíveis
// automaticamente em NENHUM lote até revisão humana específica da
// categoria inteira. Nada é descartado: os itens continuam preservados,
// só nunca avançam sozinhos para a carga real.
export const QUARANTINED_CATEGORIES = new Set(["classificados"]);

// Categorias que exigem amostragem/revisão antes do PRIMEIRO lote que as
// contiver — controlado por config externa (nenhuma automática vira
// "revisada" sozinha). Ver docs/legacy-migration-status.json.
const REVIEWED_CATEGORIES = new Set([]); // vazio = agricultura ainda não revisada.

function normalizeTitle(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countDistinctArticleLinks(bodyHtml, ownUrl) {
  if (!bodyHtml) return 0;
  const hrefs = [...bodyHtml.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
  const articleLike = hrefs.filter((h) => /\/[a-z0-9_-]+\/[a-z0-9_.-]+\.\d{5,8}/i.test(h) && !ownUrl.endsWith(h));
  return new Set(articleLike).size;
}

/**
 * Retorna { verdict: "eligible" | "needs_review" | "quarantined" | "rejected", reasons: string[] }.
 * `rejected` só quando não há absolutamente nada para revisar (falha de
 * busca). `quarantined` é uma categoria inteira ainda não liberada (item
 * 7) — diferente de `needs_review`, que é ambiguidade caso a caso.
 * Nenhum dos dois descarta o item; só o impede de virar `eligible` sozinho.
 */
export function assessArticleIntegrity(candidate, detail) {
  if (!detail) {
    return { verdict: "rejected", reasons: ["falha ao buscar a página de detalhe (ver checkpoint de erros)"] };
  }

  // 0) Quarentena por categoria (item 7, Fase 35B) — checada ANTES de
  // qualquer outra coisa: mesmo uma matéria estruturalmente perfeita não
  // pode virar "eligible" se a categoria inteira ainda não foi liberada.
  if (candidate.allCategories.some((c) => QUARANTINED_CATEGORIES.has(c))) {
    return { verdict: "quarantined", reasons: [`categoria "${candidate.primary.category}" em quarentena editorial — revisão humana da categoria inteira ainda não feita`] };
  }
  if (candidate.allCategories.some((c) => c === "agricultura") && !REVIEWED_CATEGORIES.has("agricultura")) {
    return { verdict: "quarantined", reasons: ['categoria "agricultura" ainda não passou por amostragem/revisão antes do primeiro lote (item 7)'] };
  }

  const reasons = [];

  // 1) Estrutura ambígua — mais de um bloco .entry-header/.entry-content
  // sugere que o parser pode ter capturado outra coisa (ex.: um índice
  // reaproveitando o mesmo componente visual da matéria).
  if (detail.entryHeaderCount !== 1) reasons.push(`estrutura ambígua: ${detail.entryHeaderCount} bloco(s) .entry-header (esperado exatamente 1)`);
  if (detail.entryContentCount !== 1) reasons.push(`estrutura ambígua: ${detail.entryContentCount} bloco(s) .entry-content (esperado exatamente 1)`);

  // 2) Título — precisa existir e bater (ainda que com folga de
  // normalização) com o título já visto na listagem.
  if (!detail.title) {
    reasons.push("título ausente na página de detalhe");
  } else if (candidate.primary.title) {
    const a = normalizeTitle(detail.title);
    const b = normalizeTitle(candidate.primary.title);
    if (a !== b && !a.includes(b) && !b.includes(a)) {
      reasons.push(`título da listagem diverge do título do detalhe ("${candidate.primary.title}" vs "${detail.title}")`);
    }
  }

  // 3) Data — precisa existir na própria página de detalhe e bater com a
  // data já vista na listagem (que definiu o lote), no mínimo ao nível do
  // dia (a hora, quando existe, é preservada mas não usada como critério
  // de corte de lote).
  const detailParsed = parseBrDateTime(detail.publishedRaw);
  if (!detailParsed || detailParsed.isBug) {
    reasons.push("data não encontrada (ou bugada) na estrutura da página de detalhe");
  } else if (candidate.publishedIso && detailParsed.dateIso !== candidate.publishedIso) {
    reasons.push(`data da listagem (${candidate.publishedIso}) diverge da data do detalhe (${detailParsed.dateIso})`);
  }

  // 4) Corpo — precisa ter conteúdo real e não pode conter marcação de
  // blocos não-editoriais (menu/publicidade/relacionadas/sidebar). Usa
  // `bodyTextFull` (todo o texto de `.entry-content`, não só <p>) porque
  // um achado real do lote 2015-2016 mostrou um corpo formatado inteiro
  // em <h2> (era de CMS ainda mais antiga, "Polopoly") que 0 <p> tags
  // esconderia como "vazio" mesmo tendo texto real — mas a ausência de
  // <p> continua sinalizada à parte, como estrutura inesperada.
  if (!detail.bodyTextFull || detail.bodyTextFull.length < 40) {
    reasons.push(`corpo vazio ou suspeito: apenas ${detail.bodyTextFull?.length ?? 0} caractere(s) de texto em .entry-content`);
  } else if (detail.bodyParagraphCount === 0) {
    reasons.push("corpo tem texto mas nenhuma tag <p> (estrutura inesperada — possível era de CMS diferente, ex.: uso de <h2>/<div> soltos)");
  }
  if (detail.suspiciousBodyElements?.length > 0) {
    reasons.push(`corpo contém elemento(s) de bloco não-editorial: ${detail.suspiciousBodyElements.join(", ")}`);
  }
  const distinctLinks = countDistinctArticleLinks(detail.bodyHtml, detail.url);
  if (distinctLinks > 2) {
    reasons.push(`corpo contém links para ${distinctLinks} outras matérias distintas (possível bloco de "relacionadas" incluído por engano)`);
  }

  // 5) Imagens — capa só é confiável quando vem do seletor estrutural
  // próprio da matéria (nunca do fallback <meta og:image>, que pode ser
  // um valor genérico do site); qualquer imagem fora do host de mídia
  // conhecido do legado é suspeita (pode ser publicidade/ícone externo).
  if (detail.coverUrl && detail.coverSource !== "article-structure") {
    reasons.push(`capa obtida via fallback (${detail.coverSource}), não pela estrutura própria da matéria`);
  }
  const allImageUrls = [detail.coverUrl, ...(detail.galleryImages ?? []).map((g) => g.src)].filter(Boolean);
  const untrustedImages = allImageUrls.filter((src) => !TRUSTED_IMAGE_HOST.test(src));
  if (untrustedImages.length > 0) {
    reasons.push(`${untrustedImages.length} imagem(ns) fora do host de mídia esperado (suitacdn.cloud-bricks.net)`);
  }

  return { verdict: reasons.length === 0 ? "eligible" : "needs_review", reasons };
}
