# Limpeza de duplicatas confirmadas — pós-carga 2021-2022 (Fase 44F)

Autorizada por `docs/CHATGPT_REVIEW.md` (revisão sobre HEAD `d574fd5`): 10 grupos confirmados para limpeza (8 novos de 2021-2022 com corpo idêntico + 2 pares antigos de 2019-2020 que ficaram byte-a-byte idênticos como efeito colateral da sanitização da Fase 44D). Mesma regra determinística da Fase 43. **Nenhum DELETE** — só arquivamento reversível.

## Regra determinística de canônico (idêntica à Fase 43)

1. tem capa > sem capa;
2. editoria específica > `geral`;
3. `published_at` mais recente;
4. empate exato: maior `external_id` numérico.

## Dry-run

`node --env-file=".env.local" duplicate-cleanup-2021-2022.mjs` confirmou exatamente os números autorizados antes de qualquer escrita:

| Métrica | Esperado | Encontrado |
|---|---|---|
| Grupos confirmados | 10 | 10 |
| Artigos envolvidos | 23 | 23 |
| Artigos a arquivar | 13 | 13 |
| Canônicos mantidos `published` | 10 | 10 |

O script também validou, antes de gravar: nenhum artigo dos 3 grupos `PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL` de 2021-2022 nem dos 9 grupos antigos ainda pendentes entrou na lista de arquivamento.

## Plano aplicado (`--commit`)

| # | Título | Mantido (published) | Arquivado(s) |
|---|---|---|---|
| 1 | PREFEITURA DE TORRES ABRE CRÉDITO EXTRAORDINÁRIO AO ORÇAMENTO 2021... | `406502` | `406504` |
| 2 | CEPRAG INVESTE NA MELHORIA DE SUAS REDES | `405856` | `405853` |
| 3 | UNESCO AVALIA GEOPARQUE CÂNIONS DO SUL | `403338` | `403346`, `403355` |
| 4 | SÃO JOÃO DO SUL: PREFEITO MOACIR TEIXEIRA ACOMPANHA COLOCAÇÃO DE VIGAS... | `403318` | `403324` |
| 5 | PREFEITA GISLAINE CUNHA ASSINA ORDENS DE SERVIÇOS E CONVÊNIO... | `419414` | `419415` |
| 6 | DEPUTADA GEOVANIA VOLTA À AMESC... | `231798` | `231801`, `231805`, `419408` |
| 7 | HOSPITAL REGIONAL DE ARARANGUÁ ANUNCIA ABERTURA DE SEIS NOVOS LEITOS... | `417133` | `417134` |
| 8 | SANTA CATARINA APLICA MAIS DE 4 MILHÕES DE DOSES DE VACINAS... | `416979` | `416980` |
| 9 | COVID-19: BRASIL TEM MIL NOVAS MORTES E TOTAL CHEGA A 21.048 *(2019-2020)* | `417982` | `417983` |
| 10 | TORRES E REGIÃO FICAM NA BANDEIRA LARANJA... *(2019-2020)* | `417726` | `417727` |

Cada um dos 13 artigos arquivados recebeu `status='archived'` e `archived_at=now()`. Nenhum outro campo foi alterado (título, corpo, `article_external_sources`, `media_assets`, `article_media` — todos preservados intactos).

## Validação pós-limpeza (somente leitura)

| Checagem | Resultado |
|---|---|
| Grupos com exatamente 1 `published` + resto `archived` | 10/10 |
| Artigos arquivados com `archived_at` preenchido | 13/13 |
| Total físico de `articles` (nada deletado) | 13.688 (inalterado) |
| Total `published` (origin=legacy_site) | 13.614 = 13.688 − 61 (Fase 43) − 13 (esta limpeza) ✅ |
| Total `article_external_sources` (nenhuma linha removida) | 13.688 (inalterado) |
| Total `article_media` (nenhuma mídia tocada) | 21.089 (inalterado) |
| Os 3 grupos `PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL` de 2021-2022 continuam 100% `published` | ✅ intocados |

## O que NÃO foi tocado

- Os 3 grupos `PRECISA_INSPECAO_TAMANHO_QUASE_IGUAL` de 2021-2022 (`servico-de-atendimento-24-horas-da-ccr-viacosteira...`, `rs-pagamento-antecipado-do-ipva-2022...`, `guarda-vidas-iniciam-atendimento-diario...`) — continuam pendentes de inspeção manual.
- Os 9 grupos antigos (2015-2020) ainda em "precisa inspeção manual" que não foram promovidos a duplicata confirmada.
- Os 54 grupos já resolvidos na Fase 43 — permanecem exatamente como estavam.
- `media_assets`, `article_media`, `article_external_sources` — nenhuma linha alterada ou removida em nenhum dos 13 artigos.
- Nenhum `DELETE` em nenhuma tabela.

## Ferramentas criadas

- `scripts/legacy-audit/duplicate-cleanup-2021-2022.mjs` — dry-run por padrão, `--commit` aplica.
- `scripts/legacy-audit/validate-duplicate-cleanup-2021-2022.mjs` — validação somente leitura.
