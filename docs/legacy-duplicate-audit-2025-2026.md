# Auditoria de candidatos a duplicata — pós-carga 2025-2026 (SOMENTE LEITURA, nada arquivado)

Gerado em: 2026-09-28. Script: `scripts/legacy-audit/duplicate-audit-2025-2026.mjs`. Mesma regra editorial confirmada (Fase 42/43B): título sozinho nunca decide; título+data é só candidato; confirmação exige corpo idêntico (hash) ou quase idêntico (tolerância de tamanho ≤5%, nunca decide sozinho).

Escopo: todos os 23.292 artigos `legacy_site` (os 6 lotes — migração histórica completa).

## Resumo

| Métrica | Valor |
|---|---|
| Artigos auditados | 23.292 |
| Grupos título+data (≥2 artigos) | 91 |
| Grupos duplicata/inspeção (excluindo "conteúdo diferente") | 84 |
| Já resolvidos (54 Fase 43 + 10 Fase 44F + 1 Fase 45C) | 65 |
| **Candidatos novos envolvendo 2025-2026** | **5** |
| Candidatos antigos ainda pendentes (fora de 2025-2026) | 14 |

Nenhum arquivamento foi feito nesta etapa — apenas identificação.

## 1. Candidatos novos envolvendo o lote 2025-2026 (5 grupos, todos `published`)

| # | Título | Data | Verdict | Slugs |
|---|---|---|---|---|
| 1 | ZÉ MILTON ACOMPANHA OBRAS NA SERRA DO FAXINAL E DESTACA AVANÇO DOS TRABALHOS | 2025-02-24 | PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL | `...15415743`, `...15415686` |
| 2 | II FESTIVAL MULTICULTURAL DOS CÂNIONS MOVIMENTOU MAIS DE R$200 MIL ATRAVÉS DA ECONOMIA SOLIDÁRIA | 2025-03-07 | DUPLICATA_REAL_PROVAVEL | `...15417890`, `...15417871` |
| 3 | CENTRO DE MÚLTIPLO USO DE SANTA ROSA DO SUL GANHA REFORMA TOTAL | 2025-04-25 | DUPLICATA_REAL_PROVAVEL | `...15426415`, `...15426567` |
| 4 | PRAIA GRANDE INICIA CURSO VOLTADO AO DESENVOLVIMENTO DO TURISMO RURAL | 2026-05-20 | DUPLICATA_REAL_PROVAVEL | `...15472851`, `...15472847` |
| 5 | POLÍCIA MILITAR REALIZA SOLENIDADE DE PASSAGEM DE COMANDO DO GRUPAMENTO DE PASSO DE TORRES | 2025-11-10 | PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL | `...15454223`, `...15454218` |

3 classificados `DUPLICATA_REAL_PROVAVEL` (corpo idêntico após normalização) e 2 `PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL`. **Nenhum foi arquivado** — ficam registrados para revisão manual/decisão futura, seguindo a mesma política já aplicada nos lotes anteriores.

## 2. Já resolvidos (65 grupos)

54 da limpeza da Fase 43 (2015-2020) + 10 da limpeza da Fase 44F (2021-2022/2019-2020) + 1 da limpeza da Fase 45C (2023-2024). Reaparecem na varredura porque a auditoria não filtra por status — resultado esperado das três limpezas já feitas. Não são achados novos.

## 3. Candidatos antigos ainda pendentes (14 grupos, intocados)

10 grupos de 2015-2020 + 3 grupos de 2021-2022 + 1 grupo de 2023-2024 (`SANCIONADA LEI QUE CRIMINALIZA BULLYING...`, 569333/569372) — todos já identificados em auditorias anteriores e mantidos intocados desde então. Nenhum foi tocado nesta etapa — continuam para inspeção manual futura.

## Nenhuma escrita realizada

Esta auditoria é somente leitura. Nenhum `UPDATE`/`DELETE` foi executado; nenhum artigo foi arquivado.
