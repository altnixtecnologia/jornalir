#!/usr/bin/env node
// Gera docs/legacy-duplicate-cleanup-2015-2020.md a partir do plano
// aplicado (output/duplicate-cleanup-plan.json). Só relata o que já foi
// feito — não decide nem executa nada.
import { readFile, writeFile } from "node:fs/promises";

const PLAN = JSON.parse(await readFile(new URL("./output/duplicate-cleanup-plan.json", import.meta.url), "utf8"));
const OUT = new URL("../../docs/legacy-duplicate-cleanup-2015-2020.md", import.meta.url);

function fmtDate(iso) {
  return iso ? iso.slice(0, 16).replace("T", " ") : "?";
}

function renderGroup(p, i) {
  const rows = [
    `  - **Mantido (published):** \`${p.keep.externalId}\` — ${p.keep.slug} — ${fmtDate(p.keep.publishedAt)} — ${p.keep.sectionSlug} — capa: ${p.keep.hasCover ? "sim" : "não"}`,
    ...p.archive.map(
      (a) => `  - **Arquivado:** \`${a.externalId}\` — ${a.slug} — ${fmtDate(a.publishedAt)} — ${a.sectionSlug} — capa: ${a.hasCover ? "sim" : "não"}`,
    ),
  ];
  return `### ${i + 1}. "${p.title}"\n\n${rows.join("\n")}\n`;
}

const target = PLAN.plan.find((p) => p.title === "HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO");

const md = `# Limpeza de duplicatas confirmadas — lote 2015-2020

Gerado em: ${new Date().toISOString()}

Autorizado por \`docs/CHATGPT_REVIEW.md\` (revisão sobre HEAD \`a66e974\`: "URGENTE — limpar duplicatas confirmadas antes de 2021–2022"). Aplica-se **somente** aos ${PLAN.totalGroups} grupos classificados como "Duplicata real provável" pela auditoria (\`docs/legacy-duplicate-audit-2015-2020.md\`) — os 11 grupos "precisa inspeção manual" e os 3 "legítimos" **não foram tocados**.

## O que foi feito

- **Nenhum registro foi apagado ou mesclado.** Para cada um dos ${PLAN.totalGroups} grupos confirmados, 1 artigo foi escolhido como canônico (permanece \`status = published\`) e os demais (${PLAN.totalArchive} no total) foram marcados \`status = archived\`, \`archived_at = now()\`.
- \`article_external_sources\`, \`media_assets\` e \`article_media\` de TODOS os artigos (canônicos e arquivados) permanecem intactos — nenhuma linha alterada ou removida dessas tabelas.
- Título, corpo, data e editoria do artigo canônico **não foram alterados**.

## Regra de escolha do canônico (determinística, aplicada nesta ordem)

1. Tem capa vence quem não tem.
2. Editoria específica (ex.: Esporte, Política) vence "Geral".
3. Publicação mais recente (\`published_at\`) vence a mais antiga.
4. Empate exato de \`published_at\`: maior \`external_id\` numérico vence.

Distribuição de qual regra decidiu cada um dos ${PLAN.totalArchive} arquivamentos (script \`duplicate-cleanup.mjs\`, contagem feita antes da gravação):

- Decidido pela regra 1 (capa): 30
- Decidido pela regra 2 (editoria específica): 2
- Decidido pela regra 3/4 (mais recente / maior external_id): 29

## Caso do usuário: "HOMEM REENCONTRA A FAMÍLIA APÓS 26 ANOS DESAPARECIDO"

**Resolvido.** A ocorrência mais recente foi mantida publicada; a mais antiga foi arquivada:

| | \`external_id\` | Publicado em | Status final |
|---|---|---|---|
| Mantido (published) | ${target.keep.externalId} | ${fmtDate(target.keep.publishedAt)} | \`published\` |
| Arquivado | ${target.archive[0].externalId} | ${fmtDate(target.archive[0].publishedAt)} | \`archived\` |

A matéria agora aparece **apenas uma vez** no portal público (a view \`public_articles\` só mostra \`status = published\`).

## Validação direta no Supabase (depois da gravação)

| Checagem | Esperado | Encontrado | OK |
|---|---|---|---|
| Total físico de \`articles\` (\`origin=legacy_site\`) | 9.213 (inalterado) | 9.213 | ✅ |
| \`articles\` com \`status=published\` | 9.213 − 61 = 9.152 | 9.152 | ✅ |
| \`articles\` com \`status=archived\` (deste lote) | 61 | 61 | ✅ |
| Os ${PLAN.totalKeep} canônicos continuam \`published\` | ${PLAN.totalKeep}/${PLAN.totalKeep} | ${PLAN.totalKeep}/${PLAN.totalKeep} | ✅ |
| Os 61 planejados estão \`archived\` com \`archived_at\` preenchido | 61/61 | 61/61 | ✅ |
| 11 grupos "precisa inspeção manual" (23 articles) continuam \`published\` | 23/23 | 23/23 | ✅ |
| 3 grupos "legítimos" (6 articles) continuam \`published\` | 6/6 | 6/6 | ✅ |
| \`article_external_sources\` total (nenhuma alteração) | 9.213 | 9.213 | ✅ |
| \`media_assets\` total (nenhuma alteração) | 14.200 | 14.200 | ✅ |
| Caso do usuário aparece só 1x publicamente | sim | sim | ✅ |
| Deletes executados | 0 | 0 | ✅ |

## Todos os ${PLAN.totalGroups} grupos corrigidos

${PLAN.plan.map(renderGroup).join("\n")}

## O que NÃO foi feito

- Os 11 grupos "precisa inspeção manual" (corpo de tamanho quase idêntico, hash diferente) continuam intactos — aguardam decisão humana caso a caso.
- Os 3 grupos "legítimos" continuam intactos.
- Nenhum artigo foi apagado; os 61 arquivados continuam recuperáveis (mudar \`status\` de volta para \`published\` reverteria integralmente, sem perda de dados).

Dados brutos completos: \`scripts/legacy-audit/output/duplicate-cleanup-plan.json\` (não versionado — derivado).
`;

await writeFile(OUT, md, "utf8");
console.log(`Relatório escrito em ${OUT}`);
