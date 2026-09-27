# Preflight — lote 2021-2022 (SOMENTE LEITURA, nada importado)

Gerado em: 2026-09-27T07:02:47.033Z

Intervalo: 2021-01-01 a 2022-12-31.

## Números do lote

| Métrica | Valor |
|---|---|
| Candidatas no intervalo (deduplicadas por identidade) | 4488 |
| Exceções de data (fora de qualquer lote automático) | 7 |
| **Elegíveis** | **4315** |
| Precisam de revisão manual (`needs_review`) | 173 |
| Em quarentena editorial (`quarantined`) | 0 |
| Rejeitadas (falha de busca) | 0 |
| Com imagem | 4310 |
| Sem imagem | 5 |
| Referências de imagem (elegíveis) | 6690 |
| URLs de imagem únicas (elegíveis) | 6690 |

## Distribuição por editoria (elegíveis)

- colunistas: 77
- geral: 3259
- esporte: 83
- policia: 206
- politica: 39
- saude: 557
- sociais: 36
- agricultura: 58

## Categorias encontradas

- `agricultura` apareceu na distribuição por editoria acima? **Sim (58 itens, já revisada/liberada — ver REVIEWED_CATEGORIES em lib/integrity.mjs)**.
- `classificados` apareceu neste lote (sempre em quarentena, nunca elegível automaticamente)? **Não** — ver `legacy-quarantined-2021-2022.md`.
- `classificados` continua em quarentena automática em todos os lotes até revisão humana específica da categoria inteira.

## Achado novo: conteúdo embutido não visto em lotes anteriores

Dois dos casos de `needs_review` foram sinalizados por um motivo diferente dos padrões já vistos ("corpo sem `<p>`", "corpo vazio") — um elemento de bloco não-editorial real dentro do corpo:

1. `policia/operacao_hoplitas_da_bm_mantem_acoes_no_litoral_norte_aos_fins_de_semana.231914` (2022-09-26) — o corpo contém um **widget de abas jQuery UI** (`ui-tabs`, `ui-widget-content`) embutido cru no HTML, não texto editorial normal.
2. `saude/com_o_avanco_da_vacinacao_em_sc_obitos_de_idosos_por_covid_19_tem_reducao_de_75_.416996` (2021-07-03) — o corpo embute um **gráfico Datawrapper** (`dw-chart-footer`, `dw-above-footer`) sobre óbitos de COVID-19 por idade — uma visualização de dados real, cujo próprio rodapé de atribuição (não um rodapé do site) disparou o filtro de bloco não-editorial.

Ambos foram corretamente barrados para revisão manual — nenhum dos dois é obviamente "lixo" (o segundo pode ser conteúdo editorial legítimo, um gráfico embutido de verdade), mas nenhum é texto de matéria comum, e a regra "na dúvida, não importar automaticamente" se aplica exatamente a esses casos.

## Achado (Fase 44B): vazamento de atributo/tag HTML como texto em `bodyTextFull`

Checagem solicitada pela revisão (HEAD `a40e93f`) após a amostra apontar `external_id 418316` (`esportes/campeonato_praiano_de_beach_soccer_2022_comeca_em_torres_no_proximo_sabado.418316`) com `bodyTextFull` terminando em `style="width: 363.273px; height: 646.933px;" data-filename="retriever">Divulgação/` — HTML malformado na origem (provável tag `<img>` quebrada que o cheerio não reconheceu como marcação e extraiu como texto puro).

Varredura local feita **exclusivamente sobre o cache já existente** (`output/batches/2021-2022/details.ndjson`, sem nenhum refetch, sem invalidar cache), aplicando um padrão sobre `bodyTextFull` (nunca sobre `bodyHtml`, onde esses padrões são markup legítimo) buscando `style="`, `class="`, `src="`, `href="`, `data-...="` ou tags literais inesperadas (`<img`, `<div`, `<span`, `<table`, `<td`, `<tr`, `<iframe`, `<section`).

Resultado: **160 casos** confirmados (incluindo o 418316 da amostra), todos com o mesmo padrão de origem — atributos de uma tag `<img style="..." data-filename="...">` que o parser da época não fechou corretamente e que sobrou como texto solto ao final do corpo. Todos os 160 foram reclassificados de `eligible` para `needs_review` (nenhum foi descartado) via uma nova regra conservadora em `lib/integrity.mjs` (`HTML_LEAK_IN_TEXT`), aplicada antes desta regeneração — daí `eligible` cair de 4475 para 4315 e `needs_review` subir de 13 para 173 (13 + 160), inteiramente a partir do cache já coletado, sem nenhuma nova requisição de rede.

## Localidade

Nenhuma inferência de localidade feita — todo o legado permanece `Geral` (regra fixa, não reavaliada por lote).

## Casos de revisão manual

173 casos — ver `legacy-review-2021-2022.md`.

## Nenhuma escrita real

Esta etapa é somente leitura/preflight. Nenhuma matéria ou imagem foi importada.
