#!/usr/bin/env node
// Gera docs/legacy-duplicate-audit-2015-2020.md a partir do JSON produzido
// por duplicate-audit.mjs. Só formata/relata — nenhuma decisão de
// mesclar/apagar é tomada aqui.
import { readFile, writeFile } from "node:fs/promises";

const AUDIT = JSON.parse(await readFile(new URL("./output/duplicate-audit-2015-2020.json", import.meta.url), "utf8"));
const OUT = new URL("../../docs/legacy-duplicate-audit-2015-2020.md", import.meta.url);

const VERDICT_LABELS = {
  DUPLICATA_REAL_PROVAVEL: "Duplicata real provável (mesmo corpo, mesma capa/sem capa)",
  DUPLICATA_REAL_PROVAVEL_CAPAS_DIFERENTES: "Duplicata real provável (mesmo corpo, capas diferentes)",
  PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL: "Precisa inspeção manual (corpo quase do mesmo tamanho, hash diferente)",
  TITULO_DATA_IGUAIS_CONTEUDO_DIFERENTE: "Legítimo — mesmo título/data, conteúdo claramente diferente",
};

function fmtDate(iso) {
  return iso ? iso.slice(0, 16).replace("T", " ") : "?";
}

function groupRow(a) {
  return `  - \`${a.externalId ?? "?"}\` — ${a.slug} — ${fmtDate(a.publishedAt)} — ${a.sectionSlug} — corpo: ${a.bodyLength} car. — capa: ${a.coverOriginUrl ? "sim" : "não"}`;
}

function renderGroup(g, i) {
  const title = g.articles[0].title;
  return `### ${i + 1}. "${title}" (${g.articles.length} ocorrências)

- **Veredito:** ${VERDICT_LABELS[g.verdict]}
${g.articles.map(groupRow).join("\n")}
`;
}

const byVerdict = {};
for (const g of AUDIT.titleDateGroups) {
  byVerdict[g.verdict] ??= [];
  byVerdict[g.verdict].push(g);
}

const target = AUDIT.summary.targetCase.matches;

const md = `# Auditoria de duplicatas — lote 2015-2020 (SOMENTE LEITURA)

Gerado em: ${AUDIT.summary.generatedAt}

Pedido pelo usuário após observar visualmente uma matéria duplicada no portal ("HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO"). Esta auditoria cobre os **${AUDIT.summary.totalArticlesAudited} articles** já migrados dos 3 lotes concluídos (2015-2016, 2017-2018, 2019-2020). **Nada foi apagado, mesclado ou alterado** — só auditado e classificado.

## Resumo executivo

| Métrica | Valor |
|---|---|
| Total de articles auditados | ${AUDIT.summary.totalArticlesAudited} |
| Grupos com mesmo título normalizado + mesma data | **${AUDIT.summary.titleDateGroups.totalGroups}** |
| Articles envolvidos nesses grupos | ${AUDIT.summary.titleDateGroups.totalArticlesInvolved} |
| Grupos com corpo idêntico (hash exato) | ${AUDIT.summary.bodyHashGroups.totalGroups} |
| Articles envolvidos (corpo idêntico) | ${AUDIT.summary.bodyHashGroups.totalArticlesInvolved} |
| Grupos com mesma imagem de capa entre articles diferentes | ${AUDIT.summary.coverUrlGroups.totalGroups} |
| **Duplicata estruturalmente impossível** (mesmo \`external_id\` em 2 articles) | ${AUDIT.summary.impossibleDuplicates.sameExternalId} |
| **Duplicata estruturalmente impossível** (mesma \`source_url\` em 2 articles) | ${AUDIT.summary.impossibleDuplicates.sameSourceUrl} |

**Nenhuma duplicata por identidade** (\`external_id\`/\`source_url\` iguais em dois \`articles\` diferentes) foi encontrada — o índice único de \`article_external_sources\` está funcionando corretamente. Toda duplicata encontrada é por **conteúdo republicado no site legado sob um \`external_id\`/URL diferente** — ou seja, é uma duplicata que já existia no site antigo, não um bug da migração.

## Classificação dos ${AUDIT.summary.titleDateGroups.totalGroups} grupos (mesmo título+data)

| Veredito | Grupos | Articles |
|---|---|---|
${Object.entries(AUDIT.summary.titleDateGroups.byVerdict)
  .map(([k, n]) => `| ${VERDICT_LABELS[k]} | ${n} | ${(byVerdict[k] ?? []).reduce((s, g) => s + g.articles.length, 0)} |`)
  .join("\n")}

**${(byVerdict.DUPLICATA_REAL_PROVAVEL?.length ?? 0) + (byVerdict.DUPLICATA_REAL_PROVAVEL_CAPAS_DIFERENTES?.length ?? 0)} grupos (${(byVerdict.DUPLICATA_REAL_PROVAVEL ?? []).reduce((s, g) => s + g.articles.length, 0) + (byVerdict.DUPLICATA_REAL_PROVAVEL_CAPAS_DIFERENTES ?? []).reduce((s, g) => s + g.articles.length, 0)} articles) são duplicatas reais prováveis** (corpo idêntico depois de normalizado). Mais **${byVerdict.PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL?.length ?? 0} grupos** têm corpos de tamanho quase idêntico mas hash diferente (provável edição pequena entre a republicação — ex.: typo corrigido) e precisam de inspeção manual antes de decidir. Só **${byVerdict.TITULO_DATA_IGUAIS_CONTEUDO_DIFERENTE?.length ?? 0} grupos** têm conteúdo claramente diferente apesar do título/data iguais (coincidência legítima, ex.: títulos genéricos reaproveitados como "COVID-19" ou nomes de eventos anuais).

## Caso citado pelo usuário: "HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO"

**Confirmado: é uma duplicata real.** O site legado publicou a mesma matéria duas vezes, com \`external_id\` diferente, 5 minutos de diferença, e fotos de capa diferentes (mas corpo do texto idêntico):

| Campo | Ocorrência 1 | Ocorrência 2 |
|---|---|---|
| \`article.id\` | \`${target[0]?.id}\` | \`${target[1]?.id}\` |
| Slug novo | \`${target[0]?.slug}\` | \`${target[1]?.slug}\` |
| \`external_id\` | ${target[0]?.externalId} | ${target[1]?.externalId} |
| URL de origem | ${target[0]?.sourceUrl} | ${target[1]?.sourceUrl} |
| Publicado em | ${fmtDate(target[0]?.publishedAt)} | ${fmtDate(target[1]?.publishedAt)} |
| Editoria | ${target[0]?.sectionName} | ${target[1]?.sectionName} |
| Tamanho do corpo | ${target[0]?.bodyLength} caracteres | ${target[1]?.bodyLength} caracteres |
| Hash do corpo | \`${target[0]?.bodyHash}\` | \`${target[1]?.bodyHash}\` (idêntico) |
| Capa (URL original) | ${target[0]?.coverOriginUrl} | ${target[1]?.coverOriginUrl} (foto diferente) |

Como os dois \`external_id\` (420122 e 420123) são diferentes e ambos vieram do site legado real (confirmado via \`source_url\`), **nenhuma regra de deduplicação por identidade poderia ter evitado isso** — é uma duplicata que já existia na fonte, publicada duas vezes pela própria redação/CMS do site antigo com 5 minutos de diferença. A decisão de mesclar/remover uma das duas cópias é editorial, não técnica, e não foi tomada nesta auditoria.

## Comparação com a auditoria antiga (Fase 34)

A auditoria original (\`docs/legacy-audit.json\`, antes de qualquer migração) reportou **48** ocorrências de título+data duplicado — mas sobre TODO o inventário do site (23.393 itens, 2015-2026, a maioria ainda não migrada) e contando duplicatas extras (não grupos). Esta auditoria cobre só os **9.213 articles já migrados** (2015-2020) e conta **grupos** (68 grupos = 76 ocorrências além da primeira de cada grupo). Os números não são diretamente comparáveis (escopos de anos e métricas diferentes) — **não foi assumido que um número explica o outro**. O fato relevante é que ambas as auditorias, em momentos e métodos diferentes, confirmam que duplicatas título+data são um padrão real e não-trivial no site legado, não um artefato pontual.

## Todos os ${AUDIT.summary.titleDateGroups.totalGroups} grupos, por veredito

${Object.entries(byVerdict)
  .map(
    ([verdict, groups]) => `### ${VERDICT_LABELS[verdict]} (${groups.length} grupos)

${groups.map((g, i) => renderGroup(g, i)).join("\n")}`,
  )
  .join("\n---\n\n")}

## O que esta auditoria NÃO fez

- Não apagou, mesclou ou alterou nenhum registro.
- Não decidiu qual das duas (ou mais) cópias de uma duplicata deveria ser mantida.
- Não aplicou nenhuma correção automática — mesmo os ${(byVerdict.DUPLICATA_REAL_PROVAVEL?.length ?? 0) + (byVerdict.DUPLICATA_REAL_PROVAVEL_CAPAS_DIFERENTES?.length ?? 0)} grupos classificados como "duplicata real provável" continuam como estão no banco.

## Próximo passo recomendado

Decisão editorial/produto sobre como tratar duplicatas reais do site legado (mesclar preservando as duas URLs antigas em \`raw_metadata\`? Marcar uma como duplicata e ocultar da navegação sem apagar? Manter as duas, já que ambas existiam de fato no site antigo?) — fora do escopo desta auditoria somente-leitura.

Dados brutos completos: \`scripts/legacy-audit/output/duplicate-audit-2015-2020.json\` (não versionado — derivado).
`;

await writeFile(OUT, md, "utf8");
console.log(`Relatório escrito em ${OUT}`);
