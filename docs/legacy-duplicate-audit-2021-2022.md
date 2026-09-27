# Auditoria de candidatos a duplicata — pós-carga 2021-2022 (SOMENTE LEITURA, nada arquivado)

Gerado em: 2026-09-27. Script: `scripts/legacy-audit/duplicate-audit-2021-2022.mjs`. Reaproveita a mesma regra editorial confirmada (Fase 42/43B): título sozinho nunca decide; título+data é só candidato; confirmação exige corpo idêntico (hash) ou quase idêntico (tolerância de tamanho ≤5%, nunca decide sozinho).

Escopo: todos os 13.688 artigos `legacy_site` (os 4 lotes), para não perder candidatos que cruzem a fronteira dos lotes.

## Resumo

| Métrica | Valor |
|---|---|
| Artigos auditados | 13.688 |
| Grupos título+data (≥2 artigos) | 79 |
| Grupos duplicata/inspeção (excluindo "conteúdo diferente") | 77 |
| Já resolvidos na Fase 43 (1 published + resto archived) | 54 |
| **Candidatos novos envolvendo 2021-2022** | **11** |
| Candidatos não resolvidos em lotes antigos (achado à parte, ver seção 3) | 12 |

Nenhum arquivamento foi feito nesta etapa — apenas identificação.

## 1. Candidatos novos envolvendo o lote 2021-2022 (11 grupos, todos `published`)

| # | Título | Data | Verdict | Slugs |
|---|---|---|---|---|
| 1 | SERVIÇO DE ATENDIMENTO 24 HORAS DA CCR VIACOSTEIRA COMEÇA NESTE DOMINGO, 07 | 2021-02-02 | PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL | `...407091`, `...407083` |
| 2 | PREFEITURA DE TORRES ABRE CRÉDITO EXTRAORDINÁRIO AO ORÇAMENTO 2021 PARA A ASSISTÊNCIA SOCIAL... | 2021-03-23 | DUPLICATA_REAL_PROVAVEL | `...406504`, `...406502` |
| 3 | CEPRAG INVESTE NA MELHORIA DE SUAS REDES | 2021-05-14 | DUPLICATA_REAL_PROVAVEL | `...405856`, `...405853` |
| 4 | UNESCO AVALIA GEOPARQUE CÂNIONS DO SUL | 2021-11-17 | DUPLICATA_REAL_PROVAVEL | `...403355`, `...403346`, `...403338` (3 ocorrências) |
| 5 | SÃO JOÃO DO SUL: PREFEITO MOACIR TEIXEIRA ACOMPANHA COLOCAÇÃO DE VIGAS PARA PONTE DO RIO VERDE | 2021-11-19 | DUPLICATA_REAL_PROVAVEL | `...403324`, `...403318` |
| 6 | RS: PAGAMENTO ANTECIPADO DO IPVA 2022 COM DESCONTOS E PRAZOS MAIORES COMEÇA NA QUARTA, DIA 15 | 2021-12-14 | PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL | `...403073`, `...403071` |
| 7 | GUARDA-VIDAS INICIAM ATENDIMENTO DIÁRIO NAS PRAIAS DO EXTREMO SUL NESTA QUINTA-FEIRA | 2022-11-30 | PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL | `...400358`, `...400356` |
| 8 | PREFEITA GISLAINE CUNHA ASSINA ORDENS DE SERVIÇOS E CONVÊNIO DE COMPRA DE ANESTÉSICOS... | 2021-04-01 | DUPLICATA_REAL_PROVAVEL | `...419415`, `...419414` |
| 9 | DEPUTADA GEOVANIA VOLTA À AMESC, DESTINA MAIS RECURSOS E LANÇA PROGRAMA PARA A SAÚDE DAS MULHERES... | 2021-05-21 | DUPLICATA_REAL_PROVAVEL | `...419408`, `...231805`, `...231801`, `...231798` (4 ocorrências) |
| 10 | HOSPITAL REGIONAL DE ARARANGUÁ ANUNCIA ABERTURA DE SEIS NOVOS LEITOS DE UTI COVID | 2021-04-01 | DUPLICATA_REAL_PROVAVEL | `...417134`, `...417133` |
| 11 | SANTA CATARINA APLICA MAIS DE 4 MILHÕES DE DOSES DE VACINAS CONTRA A COVID-19 | 2021-07-13 | DUPLICATA_REAL_PROVAVEL | `...416980`, `...416979` |

8 classificados `DUPLICATA_REAL_PROVAVEL` (corpo idêntico após normalização) e 3 `PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL` (corpo de tamanho muito próximo, hash diferente — provável pequena edição entre republicações). **Nenhum foi arquivado** — ficam registrados para revisão manual/decisão futura, seguindo a mesma política já aplicada em 2015-2020.

## 2. Já resolvidos na Fase 43 (54 grupos)

Reaparecem na varredura porque a auditoria não filtra por status — são exatamente os 54 grupos já corrigidos (1 `published` + resto `archived`), resultado esperado da limpeza anterior. Não são achados novos e não precisam de nenhuma ação.

## 3. Achado à parte: efeito colateral correto da Fase 44D em 2 pares de 2019-2020

Ao reauditar TODOS os lotes (não só o novo), 2 dos 11 grupos que a Fase 42 havia classificado como "precisa inspeção manual" (corpo de tamanho quase igual, hash diferente) — e um terceiro que havia sido classificado como "conteúdo diferente" (coincidência legítima) — mudaram de classificação:

| Grupo | Classificação original (Fase 42) | Classificação agora | Motivo |
|---|---|---|---|
| `covid-19-brasil-tem-mil-novas-mortes-e-total-chega-a-21048` (417983/417982, 2020-05-22) | Precisa inspeção (2438 vs 2440 car.) | **DUPLICATA_REAL_PROVAVEL** (hash idêntico, 2376 car. os dois) | Ambos os 2 artigos estavam entre os 203 sanitizados na Fase 44D — a única diferença entre os corpos era o resíduo de `<img>` quebrada; removido o resíduo dos dois, o conteúdo restante é byte-a-byte idêntico. |
| `torres-e-regiao-ficam-na-bandeira-laranja-risco-medio-na-13-rodada-do-distanciam` (417727/417726, 2020-08-01) | Coincidência legítima (1977 vs 1809 car., diferença de 8,5% — acima da tolerância de 5%) | **DUPLICATA_REAL_PROVAVEL** (hash idêntico, 1809 car. os dois) | Só `417727` estava entre os 203 sanitizados; `417726` já não tinha resíduo. Removido o resíduo de `417727`, seu corpo passou a bater exatamente com o de `417726`. |

Ambos os artigos de cada par continuam **published** — **nenhum arquivamento foi feito**. Isso é registrado aqui explicitamente porque é um achado de auditoria correto e verificável (não um bug do script; confirmado por comparação direta dos hashes atuais no banco), mas está **fora do escopo desta fase** (que é sobre 2021-2022) e envolve o lote 2019-2020, já `complete`. Fica para decisão explícita numa próxima etapa se esses 2 pares devem ser corrigidos com a mesma regra determinística já usada na limpeza de 2015-2020 (manter a cópia com capa/mais recente, arquivar a outra).

Os outros 9 grupos da lista original de 11 permanecem exatamente como estavam (precisa inspeção manual, intocados).

## Nenhuma escrita realizada

Esta auditoria é somente leitura. Nenhum `UPDATE`/`DELETE` foi executado; nenhum artigo foi arquivado.
