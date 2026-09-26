#!/usr/bin/env node
// Agrega o inventário de listagem (output/inventory.ndjson) + amostras de
// detalhe (output/detail-samples.json) + checkpoint (totais oficiais) em
// docs/legacy-audit.md e docs/legacy-audit.json (Fase 34, item 9).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const AUDIT_DIR = fileURLToPath(new URL("./", import.meta.url));
const INVENTORY_FILE = path.join(AUDIT_DIR, "output", "inventory.ndjson");
const DETAIL_FILE = path.join(AUDIT_DIR, "output", "detail-samples.json");
const CHECKPOINT_FILE = path.join(AUDIT_DIR, "checkpoints", "checkpoint.json");
const REPORT_MD = path.join(ROOT, "docs", "legacy-audit.md");
const REPORT_JSON = path.join(ROOT, "docs", "legacy-audit.json");

// Mapeamento categoria legada -> editoria real já existente (item 2).
// "agricultura" e "classificados" não têm editoria equivalente hoje:
// mapeados como null (não mapeado) — nunca criados automaticamente.
const CATEGORY_TO_EDITORIA = {
  geral: "Geral",
  esportes: "Esportes",
  policia: "Polícia",
  politica: "Política",
  saude: "Saúde",
  sociais: "Sociais",
  agricultura: null,
  classificados: null,
  "colunistas/roni_raupp": "Colunistas",
  "colunistas/apae_de_sao_joao_do_sul": "Colunistas",
  "colunistas/outras": "Colunistas",
  "colunistas/informativo_contabil": "Colunistas",
};

function parseListingDate(raw) {
  // formatos observados: "dd/mm/aaaa hh:mm" (às vezes só a data).
  if (!raw) return null;
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, d, m, y] = match;
  const iso = `${y}-${m}-${d}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return { iso, isEpochZeroBug: iso === "1969-12-31" || iso === "1970-01-01" };
}

async function main() {
  const raw = await readFile(INVENTORY_FILE, "utf8");
  const items = raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  const checkpoint = JSON.parse(await readFile(CHECKPOINT_FILE, "utf8"));
  let detailSamples = {};
  try {
    detailSamples = JSON.parse(await readFile(DETAIL_FILE, "utf8"));
  } catch {
    // amostra de detalhe pode não existir ainda em uma execução parcial
  }

  const byCategory = {};
  const seenUrls = new Map();
  const seenSlugs = new Map();
  const seenTitleDate = new Map();
  let withThumb = 0;
  let withoutThumb = 0;
  let noDate = 0;
  let epochZeroBug = 0;
  let minDate = null;
  let maxDate = null;
  const duplicateUrls = [];
  const duplicateSlugs = [];
  const duplicateTitleDate = [];

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;

    if (item.hasThumbInListing) withThumb += 1;
    else withoutThumb += 1;

    const parsedDate = parseListingDate(item.listingDateRaw);
    if (!parsedDate) {
      noDate += 1;
    } else {
      if (parsedDate.isEpochZeroBug) epochZeroBug += 1;
      else {
        if (!minDate || parsedDate.iso < minDate) minDate = parsedDate.iso;
        if (!maxDate || parsedDate.iso > maxDate) maxDate = parsedDate.iso;
      }
    }

    if (seenUrls.has(item.url)) duplicateUrls.push(item.url);
    else seenUrls.set(item.url, true);

    const slugKey = `${item.category}:${item.slug}`;
    if (item.slug) {
      if (seenSlugs.has(slugKey)) duplicateSlugs.push(slugKey);
      else seenSlugs.set(slugKey, true);
    }

    const titleDateKey = `${item.title}::${item.listingDateRaw}`;
    if (item.title) {
      if (seenTitleDate.has(titleDateKey)) duplicateTitleDate.push(titleDateKey);
      else seenTitleDate.set(titleDateKey, true);
    }
  }

  const officialTotals = {};
  let officialGrandTotal = 0;
  for (const [cat, meta] of Object.entries(checkpoint.categories ?? {})) {
    officialTotals[cat] = meta.total ?? null;
    if (meta.total) officialGrandTotal += meta.total;
  }

  const foundGrandTotal = items.length;
  const coverageByCategory = Object.fromEntries(
    Object.keys(officialTotals).map((cat) => {
      const official = officialTotals[cat];
      const found = byCategory[cat] ?? 0;
      const pagesDone = (checkpoint.pagesDone?.[cat] ?? []).length;
      const pagesExpected = checkpoint.categories[cat]?.lastPage ?? null;
      return [cat, { official, found, pagesDone, pagesExpected, fullyPaginated: pagesExpected != null && pagesDone >= pagesExpected }];
    }),
  );

  const unmappedCategories = Object.keys(byCategory).filter((cat) => CATEGORY_TO_EDITORIA[cat] === null || CATEGORY_TO_EDITORIA[cat] === undefined);

  const authorsFound = new Set();
  const columnistsFound = new Set();
  for (const [cat, samples] of Object.entries(detailSamples)) {
    for (const s of samples) {
      if (s.sourceLabel) {
        if (cat.startsWith("colunistas/")) columnistsFound.add(`${cat} :: ${s.sourceLabel}`);
        else authorsFound.add(s.sourceLabel);
      }
    }
  }

  const errorPages = checkpoint.errors ?? [];

  const summary = {
    generatedAt: new Date().toISOString(),
    totalEncontrado: foundGrandTotal,
    totalOficial: officialGrandTotal,
    porCategoria: byCategory,
    totalOficialPorCategoria: officialTotals,
    cobertura: coverageByCategory,
    periodo: { inicio: minDate, fim: maxDate },
    comImagemNaListagem: withThumb,
    semImagemNaListagem: withoutThumb,
    semDataDetectavel: noDate,
    dataZeroBug: epochZeroBug,
    duplicidades: {
      urls: duplicateUrls.length,
      slugsPorCategoria: duplicateSlugs.length,
      tituloMaisData: duplicateTitleDate.length,
      exemplosUrls: duplicateUrls.slice(0, 10),
      exemplosSlugs: duplicateSlugs.slice(0, 10),
      exemplosTituloData: duplicateTitleDate.slice(0, 10),
    },
    categoriasNaoMapeadas: unmappedCategories,
    autoresEncontrados: [...authorsFound],
    colunistasEncontrados: [...columnistsFound],
    paginasComErro: errorPages,
    amostrasDetalhe: detailSamples,
  };

  await writeFile(REPORT_JSON, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(REPORT_MD, renderMarkdown(summary), "utf8");
  console.log(`Relatório gerado: ${REPORT_MD}`);
  console.log(`Dados agregados: ${REPORT_JSON}`);
}

function renderMarkdown(s) {
  const catRows = Object.keys(s.porCategoria)
    .sort()
    .map((cat) => {
      const cov = s.cobertura[cat] ?? {};
      const editoria = CATEGORY_TO_EDITORIA[cat] ?? "**NÃO MAPEADA**";
      return `| ${cat} | ${editoria} | ${cov.official ?? "?"} | ${s.porCategoria[cat]} | ${cov.pagesDone ?? "?"}/${cov.pagesExpected ?? "?"} | ${cov.fullyPaginated ? "sim" : "NÃO"} |`;
    })
    .join("\n");

  return `# Auditoria do site legado (informativoregional.net)

Gerado em: ${s.generatedAt}

Modo: **audit/read-only** — nenhuma gravação no Supabase, nenhum download de imagem, nenhuma alteração no site antigo (Fase 34).

## Fonte de dados escolhida

Sitemaps (\`sitemap_index.xml\`) só cobrem conteúdo recente (estilo Google News) e servem apenas para descoberta de categorias.
O arquivo histórico completo é acessado via paginação das páginas de listagem por categoria (\`?pagina=N&filtro=antigos\`), que expõe
o total oficial ("Total N matérias") e a última página — usados aqui como base objetiva de cobertura (item 10).

## Cobertura por categoria

| Categoria | Editoria equivalente | Total oficial (site) | Total encontrado | Páginas percorridas | Paginação completa |
|---|---|---|---|---|---|
${catRows}

**Total oficial (soma das categorias):** ${s.totalOficial}
**Total encontrado (itens de listagem coletados):** ${s.totalEncontrado}

${s.totalOficial === s.totalEncontrado ? "Totais batem exatamente." : `**Diferença:** ${s.totalOficial - s.totalEncontrado} (reportada sem tentar "corrigir" silenciosamente — ver páginas com erro abaixo).`}

## Período coberto

- Data mais antiga detectada: ${s.periodo.inicio ?? "não determinada"}
- Data mais recente detectada: ${s.periodo.fim ?? "não determinada"}
- Itens com data "zero" (bug real do CMS legado, renderiza como 31/12/1969 21:00): ${s.dataZeroBug}
- Itens sem data detectável na listagem: ${s.semDataDetectavel}

## Imagens (nível de listagem)

- Itens com miniatura na listagem: ${s.comImagemNaListagem}
- Itens sem miniatura na listagem (\`titulo-sem-img\`): ${s.semImagemNaListagem}

Extração completa de imagens (capa, galeria, legenda, crédito) foi validada em uma amostra por categoria — ver \`amostrasDetalhe\` no JSON anexo. Nenhuma imagem foi baixada nesta fase.

## Autores e colunistas

- Autores/fontes encontrados na amostra: ${s.autoresEncontrados.join(", ") || "nenhum detectado na amostra"}
- Colunistas encontrados na amostra: ${s.colunistasEncontrados.join(", ") || "nenhum detectado na amostra"}

Observação: a página de matéria do site legado **não tem campo estrutural de autor** — o único texto disponível é um link \`.post-cat\` que, na prática, carrega o nome de quem assinou a nota (ex.: "Assessoria de Comunicação"), não uma categoria. Deve ser tratado como \`author_name\`/\`autor original\`, nunca como editoria.

## Localidades

O site legado **não possui campo estruturado de cidade/localidade** nas páginas auditadas (nem na listagem, nem na página de matéria). Não foi feita nenhuma tentativa de inferir cidade a partir do título ou corpo do texto (proibido nesta fase). Qualquer regra de localidade para a importação futura precisa ser definida e aprovada separadamente.

## Categorias não mapeadas

${s.categoriasNaoMapeadas.length > 0 ? s.categoriasNaoMapeadas.map((c) => `- \`${c}\``).join("\n") : "Nenhuma."}

Estas categorias existem no site legado mas não têm editoria equivalente hoje. Nenhuma editoria foi criada automaticamente.

## Duplicidades

- URLs duplicadas na coleta: ${s.duplicidades.urls}
- Slugs repetidos dentro da mesma categoria: ${s.duplicidades.slugsPorCategoria}
- Título + data idênticos: ${s.duplicidades.tituloMaisData}

Título+data idêntico **não** foi tratado como prova de duplicidade real — apenas reportado como candidato a revisão manual futura (item 8).

## Páginas com erro

${s.paginasComErro.length > 0 ? `${s.paginasComErro.length} página(s) de listagem retornaram erro:\n\n${s.paginasComErro.map((e) => `- ${e.categoryPath} página ${e.page}: status ${e.status}`).join("\n")}` : "Nenhuma página de listagem retornou erro."}

## Campos que não puderam ser extraídos de forma confiável nesta fase

- Autor estruturado (não existe no HTML — apenas o rótulo \`.post-cat\`, tratado como \`sourceLabel\`).
- Legenda/crédito por imagem: campos existem no HTML (\`.p-galery-descricao\`/\`.p-galery-credit\`) mas estavam vazios em todas as amostras coletadas.
- Subcategoria/coluna estruturada fora de \`colunistas/*\`: não observada.

## O que esta auditoria NÃO fez (por definição do escopo da Fase 34)

- Não inseriu nada em \`articles\`, \`media_assets\` ou \`article_external_sources\`.
- Não baixou nenhuma imagem.
- Não alterou o site antigo.
- Não fez a extração de campo completo (corpo/imagens/legendas) de todo o acervo — apenas de uma amostra por categoria, para validar os seletores. O restante do corpo de cada matéria pode ser extraído sob demanda na Fase 35, reaproveitando o mesmo coletor.

Dados brutos completos: \`scripts/legacy-audit/output/inventory.ndjson\` (não versionado — grande demais para o repositório).
`;
}

main().catch((error) => {
  console.error("Falha ao gerar relatório:", error);
  process.exitCode = 1;
});
