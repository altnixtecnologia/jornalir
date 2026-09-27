# Auditoria de candidatos a duplicata — pós-carga 2023-2024 (SOMENTE LEITURA, nada arquivado)

Gerado em: 2026-09-27. Script: `scripts/legacy-audit/duplicate-audit-2023-2024.mjs`. Mesma regra editorial confirmada (Fase 42/43B): título sozinho nunca decide; título+data é só candidato; confirmação exige corpo idêntico (hash) ou quase idêntico (tolerância de tamanho ≤5%, nunca decide sozinho).

Escopo: todos os 17.980 artigos `legacy_site` (os 5 lotes).

## Resumo

| Métrica | Valor |
|---|---|
| Artigos auditados | 17.980 |
| Grupos título+data (≥2 artigos) | 85 |
| Grupos duplicata/inspeção (excluindo "conteúdo diferente") | 79 |
| Já resolvidos (54 Fase 43 + 10 Fase 44F) | 64 |
| **Candidatos novos envolvendo 2023-2024** | **2** |
| Candidatos antigos ainda pendentes (fora de 2023-2024) | 13 |

Nenhum arquivamento foi feito nesta etapa — apenas identificação.

## 1. Candidatos novos envolvendo o lote 2023-2024 (2 grupos, todos `published`)

| # | Título | Data | Verdict | Slugs |
|---|---|---|---|---|
| 1 | CASOS DE DENGUE AUMENTAM 900% EM SC | 2024-01-30 | DUPLICATA_REAL_PROVAVEL | `...572497`, `...572509` |
| 2 | SANCIONADA LEI QUE CRIMINALIZA BULLYING E AMPLIA PUNIÇÃO PARA CRIME CONTRA CRIANÇA | 2024-01-16 | PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL | `...569333`, `...569372` |

**Nenhum foi arquivado** — ficam registrados para revisão manual/decisão futura, seguindo a mesma política já aplicada nos lotes anteriores.

## 2. Já resolvidos (64 grupos)

54 da limpeza da Fase 43 (2015-2020) + 10 da limpeza da Fase 44F (8 de 2021-2022 + 2 pares de 2019-2020). Reaparecem na varredura porque a auditoria não filtra por status — são o resultado esperado das duas limpezas já feitas. Não são achados novos.

## 3. Candidatos antigos ainda pendentes (13 grupos, intocados)

10 grupos de 2015-2020 (os que restaram da lista original de 11 "precisa inspeção manual" da Fase 42, depois que 1 foi promovido e arquivado na Fase 44F) + 3 grupos de 2021-2022 (`PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL`, identificados na Fase 44E e mantidos intocados na limpeza da Fase 44F). Nenhum foi tocado nesta etapa — continuam para inspeção manual futura.

## Nenhuma escrita realizada

Esta auditoria é somente leitura. Nenhum `UPDATE`/`DELETE` foi executado; nenhum artigo foi arquivado.
