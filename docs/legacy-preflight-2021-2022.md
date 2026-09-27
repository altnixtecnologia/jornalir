# Preflight — lote 2021-2022 (SOMENTE LEITURA, nada importado)

Gerado em: 2026-09-27T06:51:24.018Z

Intervalo: 2021-01-01 a 2022-12-31.

## Números do lote

| Métrica | Valor |
|---|---|
| Candidatas no intervalo (deduplicadas por identidade) | 4488 |
| Exceções de data (fora de qualquer lote automático) | 7 |
| **Elegíveis** | **4475** |
| Precisam de revisão manual (`needs_review`) | 13 |
| Em quarentena editorial (`quarantined`) | 0 |
| Rejeitadas (falha de busca) | 0 |
| Com imagem | 4469 |
| Sem imagem | 6 |
| Referências de imagem (elegíveis) | 6889 |
| URLs de imagem únicas (elegíveis) | 6889 |

## Distribuição por editoria (elegíveis)

- colunistas: 82
- geral: 3377
- esporte: 86
- policia: 208
- politica: 40
- saude: 586
- sociais: 37
- agricultura: 59

## Categorias encontradas

- `agricultura` apareceu na distribuição por editoria acima? **Sim (59 itens, já revisada/liberada — ver REVIEWED_CATEGORIES em lib/integrity.mjs)**.
- `classificados` apareceu neste lote (sempre em quarentena, nunca elegível automaticamente)? **Não** — ver `legacy-quarantined-2021-2022.md`.
- `classificados` continua em quarentena automática em todos os lotes até revisão humana específica da categoria inteira.

## Achado novo: conteúdo embutido não visto em lotes anteriores

Dois dos 13 `needs_review` foram sinalizados por um motivo diferente dos padrões já vistos ("corpo sem `<p>`", "corpo vazio") — um elemento de bloco não-editorial real dentro do corpo:

1. `policia/operacao_hoplitas_da_bm_mantem_acoes_no_litoral_norte_aos_fins_de_semana.231914` (2022-09-26) — o corpo contém um **widget de abas jQuery UI** (`ui-tabs`, `ui-widget-content`) embutido cru no HTML, não texto editorial normal.
2. `saude/com_o_avanco_da_vacinacao_em_sc_obitos_de_idosos_por_covid_19_tem_reducao_de_75_.416996` (2021-07-03) — o corpo embute um **gráfico Datawrapper** (`dw-chart-footer`, `dw-above-footer`) sobre óbitos de COVID-19 por idade — uma visualização de dados real, cujo próprio rodapé de atribuição (não um rodapé do site) disparou o filtro de bloco não-editorial.

Ambos foram corretamente barrados para revisão manual — nenhum dos dois é obviamente "lixo" (o segundo pode ser conteúdo editorial legítimo, um gráfico embutido de verdade), mas nenhum é texto de matéria comum, e a regra "na dúvida, não importar automaticamente" se aplica exatamente a esses casos.

## Localidade

Nenhuma inferência de localidade feita — todo o legado permanece `Geral` (regra fixa, não reavaliada por lote).

## Casos de revisão manual

13 casos — ver `legacy-review-2021-2022.md`.

## Nenhuma escrita real

Esta etapa é somente leitura/preflight. Nenhuma matéria ou imagem foi importada.
