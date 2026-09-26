import * as cheerio from "cheerio";

const BASE = "https://www.informativoregional.net";

/** Sitemap índice raiz — só usado para descobrir categorias que talvez não estejam no menu principal (item 1/2). */
export function parseSitemapIndexCategories(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const categories = new Set();
  $("sitemap > loc").each((_, el) => {
    const loc = $(el).text().trim();
    const match = loc.match(/^https?:\/\/(?:www\.)?informativoregional\.net\/([a-z0-9_-]+)\//i);
    if (match) categories.add(match[1].toLowerCase());
  });
  return [...categories];
}

/**
 * Extrai o total oficial ("Total N matérias") e o número da última página
 * a partir da listagem paginada — o próprio site expõe os dois (item 10:
 * base objetiva para validar cobertura, nunca um número inventado).
 */
export function parseListingMeta(html) {
  const totalMatch = html.match(/Total\s+([\d.]+)\s+mat[ée]rias/i);
  const total = totalMatch ? Number(totalMatch[1].replace(/\./g, "")) : null;

  const pageLinks = [...html.matchAll(/[?&]pagina=(\d+)&filtro=antigos/gi)].map((m) => Number(m[1]));
  const lastPage = pageLinks.length > 0 ? Math.max(...pageLinks) : null;

  return { total, lastPage };
}

/**
 * Itens reais da listagem (`.ts-grid-box.ts-grid-content`) — exclui
 * deliberadamente qualquer widget de "mais lidas"/destaques que apareça
 * em outra área da página (achado real da Fase 34: usar um seletor amplo
 * como "todo link para /<categoria>/..." pega itens de um widget que se
 * repete em toda página, sempre os mesmos, contaminando a paginação).
 */
export function parseListingItems(html, category) {
  const $ = cheerio.load(html);
  const items = [];
  $(".ts-grid-box.ts-grid-content").each((_, el) => {
    const box = $(el);
    const link = box.find(".post-title a").first();
    const href = link.attr("href");
    if (!href) return;
    const urlMatch = href.match(/^\/([a-z0-9_-]+(?:\/[a-z0-9_-]+)*)\/([a-z0-9_-]+)\.(\d+)$/i);
    const title = link.text().trim();
    const dateInfo = box.find(".post-date-info").first().text().replace(/\s+/g, " ").trim();
    const thumb = box.find(".ts-post-thumb img").first().attr("src") || null;

    items.push({
      category,
      href,
      url: BASE + href,
      slug: urlMatch ? urlMatch[2] : null,
      externalId: urlMatch ? urlMatch[3] : null,
      title,
      listingDateRaw: dateInfo || null,
      hasThumbInListing: Boolean(thumb),
      thumbUrl: thumb,
    });
  });
  return items;
}

/**
 * Página de UMA matéria — extração completa (item 3). Seletores
 * VALIDADOS contra páginas reais (uma "era nova" com id de 8 dígitos e
 * uma "era antiga" com id de 6 dígitos — mesma estrutura nas duas):
 * título em `.entry-header h2.post-title`, subtítulo/resumo opcional em
 * `.entry-content h3.class-resumo`, data em `.post-meta-info` (não há
 * NENHUM campo estrutural de autor/redator na página — apenas um link
 * `.post-cat` que na prática carrega o nome de quem assinou a nota, ex.
 * "Assessoria de Comunicação", não uma categoria; ver `sourceLabel`),
 * capa em `.single-big-img img.img-principal-artigo`, legenda da capa em
 * `.legenda-imagem li`, galeria em `#carouselExampleControls
 * .carousel-item img` (é preciso escopar por esse id: a MESMA classe
 * `.carousel-item` também é usada por um carrossel de publicidade lateral
 * na mesma página, que contaminaria a extração se pego por classe solta).
 */
export function parseArticlePage(html, url) {
  const $ = cheerio.load(html);

  const title = $(".entry-header .post-title").first().text().trim() || null;
  const subtitle = $(".entry-content h3.class-resumo").first().text().trim() || null;
  const sourceLabel = $(".entry-header .post-cat").first().text().trim() || null;
  const publishedRaw = $(".entry-header .post-meta-info").first().text().replace(/\s+/g, " ").trim() || null;

  const bodySelectorUsed = ".entry-content";
  const bodyEl = $(".entry-content").first();
  const bodyParagraphs = [];
  bodyEl.find("p").each((_, p) => {
    const text = $(p).text().replace(/\s+/g, " ").trim();
    if (text) bodyParagraphs.push(text);
  });

  const coverUrl = $(".single-big-img img.img-principal-artigo").first().attr("src") || $("meta[property='og:image']").attr("content") || null;
  const coverCaption = $(".legenda-imagem li").first().text().trim() || null;

  const galleryImages = [];
  $("#carouselExampleControls .carousel-item").each((_, item) => {
    const box = $(item);
    const src = box.find("img").attr("src");
    if (!src) return;
    const caption = box.find(".p-galery-descricao").text().trim() || null;
    const credit = box.find(".p-galery-credit").text().trim() || null;
    galleryImages.push({ src, caption, credit });
  });
  const nonCoverGallery = galleryImages.filter((img) => img.src !== coverUrl);

  return {
    url,
    title,
    subtitle,
    sourceLabel,
    publishedRaw,
    bodySelectorUsed,
    bodyParagraphCount: bodyParagraphs.length,
    bodyTextLength: bodyParagraphs.join(" ").length,
    bodyTextSample: bodyParagraphs.join(" ").slice(0, 500) || null,
    coverUrl,
    coverCaption,
    galleryImageCount: galleryImages.length,
    galleryImages: galleryImages.slice(0, 20),
    additionalImageCount: nonCoverGallery.length,
  };
}
