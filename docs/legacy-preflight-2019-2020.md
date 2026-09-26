# Preflight — lote 2019-2020 (SOMENTE LEITURA, nada importado)

Gerado em: 2026-09-26T23:32:39.217Z

Intervalo: 2019-01-01 a 2020-12-31.

## Números do lote

| Métrica | Valor |
|---|---|
| Candidatas no intervalo (deduplicadas por identidade) | 5100 |
| Exceções de data (fora de qualquer lote automático) | 7 |
| **Elegíveis** | **5088** |
| Precisam de revisão manual (`needs_review`) | 12 |
| Em quarentena editorial (`quarantined`) | 0 |
| Rejeitadas (falha de busca) | 0 |
| Com imagem | 5039 |
| Sem imagem | 49 |
| Referências de imagem (elegíveis) | 7082 |
| URLs de imagem únicas (elegíveis) | 7082 |

## Distribuição por editoria (elegíveis)

- policia: 298
- saude: 885
- agricultura: 39
- colunistas: 28
- geral: 3450
- esporte: 107
- politica: 236
- sociais: 45

## Categorias encontradas

- `agricultura` apareceu na distribuição por editoria acima? **Sim (39 itens, já revisada/liberada — ver REVIEWED_CATEGORIES em lib/integrity.mjs)**.
- `classificados` apareceu neste lote (sempre em quarentena, nunca elegível automaticamente)? **Não** — ver `legacy-quarantined-2019-2020.md`.
- `classificados` continua em quarentena automática em todos os lotes até revisão humana específica da categoria inteira.

## Achado esperado: categoria "polícia" aparece pela primeira vez

Confirmado no inventário completo: a primeira matéria de `policia` no site legado inteiro é de **2020-04-03** (`bm_de_torres_prende_homem_que_ja_fez_mais_de_13_roubos.419406`) — não existe nenhum item de `policia` antes disso (0 em 2015-2018, conforme já documentado nas Fases 34-38). 898 itens de `policia` no total do inventário, 298 já elegíveis neste lote (os demais são de 2021 em diante).

**Confirmação do mapeamento `policia -> Polícia`:** a categoria legada `policia` mapeia para `editorial_sections.slug = "policia"`, cujo `name` é `"Polícia"` (seed original, `supabase/migrations/20260921101100_seed_reference_data.sql`, linha `('Polícia', 'policia', 2)`) — o mesmo mapeamento usado desde a Fase 33, sem mudança nesta fase. Três matérias reais de `policia` foram conferidas manualmente (conteúdo genuíno de ocorrência policial — prisões, tráfico —, nada de conteúdo mal categorizado):

1. "BM DE TORRES PRENDE HOMEM QUE JÁ FEZ MAIS DE 13 ROUBOS" (03/04/2020) — ver amostra #1 em `legacy-sample-check-2019-2020.md`.
2. "BM PRENDE MULHER POR TRÁFICO DE DROGAS EM TERRA DE AREIA" (06/06/2020) — amostra #2.
3. "BM PRENDE TRIO POR TRÁFICO DE DROGAS DURANTE OPERAÇÃO AVANTE FORÇA TOTAL EM TORRES" (22/08/2020) — amostra #3.

## Outras categorias novas neste lote

- `saude` (885 elegíveis) — primeira aparição real de conteúdo de Saúde em volume no legado (a editoria já existia desde a Fase 33, mas sem matérias migradas até agora); amostra #4 em diante em `legacy-sample-check-2019-2020.md`.
- `colunistas` (28 elegíveis, agregando as 4 sub-colunas do legado) — mesma editoria já usada desde a Fase 35 (2015-2018 não teve nenhum item de colunistas dentro do intervalo).

## Localidade

Nenhuma inferência de localidade feita — todo o legado permanece `Geral` (regra fixa, não reavaliada por lote).

## Casos de revisão manual

12 casos — ver `legacy-review-2019-2020.md`.

## Nenhuma escrita real

Esta etapa é somente leitura/preflight. Nenhuma matéria ou imagem foi importada.
