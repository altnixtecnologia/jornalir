// Barreira de integridade editorial (Fase 35). Nenhuma matéria é
// considerada "eligible" (apta à carga automática) a menos que título,
// data, corpo e imagens venham EXCLUSIVAMENTE da estrutura própria da
// página de matéria — nunca de menu, publicidade, relacionadas, rodapé
// ou sidebar. Qualquer ambiguidade vira `needs_review`, nunca é
// descartada nem importada às cegas.

const TRUSTED_IMAGE_HOST = /suitacdn\.cloud-bricks\.net/i;

function normalizeTitle(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBrDate(raw) {
  const m = (raw || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

function countDistinctArticleLinks(bodyHtml, ownUrl) {
  if (!bodyHtml) return 0;
  const hrefs = [...bodyHtml.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
  const articleLike = hrefs.filter((h) => /\/[a-z0-9_-]+\/[a-z0-9_.-]+\.\d{5,8}/i.test(h) && !ownUrl.endsWith(h));
  return new Set(articleLike).size;
}

/**
 * Retorna { verdict: "eligible" | "needs_review" | "rejected", reasons: string[] }.
 * `rejected` só quando não há absolutamente nada para revisar (falha de
 * busca) — qualquer outro problema vira `needs_review` (nunca some).
 */
export function assessArticleIntegrity(candidate, detail) {
  if (!detail) {
    return { verdict: "rejected", reasons: ["falha ao buscar a página de detalhe (ver checkpoint de erros)"] };
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
  // data já vista na listagem (que definiu o lote).
  const detailIso = parseBrDate(detail.publishedRaw);
  if (!detailIso) {
    reasons.push("data não encontrada na estrutura da página de detalhe");
  } else if (candidate.publishedIso && detailIso !== candidate.publishedIso) {
    reasons.push(`data da listagem (${candidate.publishedIso}) diverge da data do detalhe (${detailIso})`);
  }

  // 4) Corpo — precisa ter conteúdo real e não pode conter marcação de
  // blocos não-editoriais (menu/publicidade/relacionadas/sidebar).
  if (!detail.bodyParagraphCount) {
    reasons.push("corpo vazio (0 parágrafos extraídos)");
  } else if (detail.bodyTextLength < 40) {
    reasons.push(`corpo suspeito: texto muito curto (${detail.bodyTextLength} caracteres)`);
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
