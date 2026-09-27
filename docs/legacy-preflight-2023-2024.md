# Preflight — lote 2023-2024 (SOMENTE LEITURA, nada importado)

Gerado em: 2026-09-27T14:06:32.622Z

Intervalo: 2023-01-01 a 2024-12-31.

## Números do lote

| Métrica | Valor |
|---|---|
| Candidatas no intervalo (deduplicadas por identidade) | 4297 |
| Exceções de data (fora de qualquer lote automático) | 7 |
| **Elegíveis** | **4292** |
| Precisam de revisão manual (`needs_review`) | 2 |
| Em quarentena editorial (`quarantined`) | 3 |
| Rejeitadas (falha de busca) | 0 |
| Com imagem | 4276 |
| Sem imagem | 16 |
| Referências de imagem (elegíveis) | 7165 |
| URLs de imagem únicas (elegíveis) | 7165 |

## Distribuição por editoria (elegíveis)

- colunistas: 43
- geral: 3125
- esporte: 231
- policia: 76
- politica: 261
- saude: 195
- sociais: 193
- agricultura: 168

## Categorias encontradas

- `agricultura` apareceu na distribuição por editoria acima? **Sim (168 itens, já revisada/liberada — ver REVIEWED_CATEGORIES em lib/integrity.mjs)**.
- `classificados` apareceu neste lote (sempre em quarentena, nunca elegível automaticamente)? **Sim (3 itens)** — ver `legacy-quarantined-2023-2024.md`.
- `classificados` continua em quarentena automática em todos os lotes até revisão humana específica da categoria inteira.

## Achado novo: primeira aparição real de `classificados`

`classificados` nunca havia aparecido em nenhum lote anterior (2015-2020, 2021-2022 tiveram 0 itens). Neste lote apareceram **3 itens**, todos corretamente barrados pela quarentena editorial da categoria (item 7, nunca elegíveis automaticamente até revisão humana da categoria inteira):

1. `classificados/prouni_mec_inicia_segunda_chamada_para_comprovacao_de_documentos.531838` (2023-07-24) — "PROUNI: MEC INICIA SEGUNDA CHAMADA PARA COMPROVAÇÃO DE DOCUMENTOS".
2. `classificados/sul_de_sc_61_baleias_francas_sao_avistadas_em_sobrevoo_de_monitoramento_do_porto_de_imbituba.531843` (2023-07-24) — "SUL DE SC: 61 BALEIAS-FRANCAS SÃO AVISTADAS EM SOBREVOO DE MONITORAMENTO DO PORTO DE IMBITUBA".
3. `classificados/_ccr_viacosteira_informa_cronograma_semanal_de_obras_na_br_101_sul_sc.604963` (2024-07-15) — "CCR VIACOSTEIRA INFORMA CRONOGRAMA SEMANAL DE OBRAS NA BR-101 SUL/SC".

**Observação editorial relevante para a futura revisão da categoria:** pelos títulos, nenhum dos 3 parece ser um classificado de fato (anúncio/aviso) — são notícias comuns (educação, fauna marinha, obras rodoviárias) aparentemente publicadas sob a URL `/classificados/` por engano ou reaproveitamento da mesma categoria no CMS legado para conteúdo avulso. Isso reforça a decisão de manter a categoria inteira em quarentena até uma revisão humana específica — não basta liberar `classificados` cegamente como foi feito com `agricultura`, pois aqui a amostra sugere uma mistura de conteúdo, não uma categoria editorial consistente.

## Localidade

Nenhuma inferência de localidade feita — todo o legado permanece `Geral` (regra fixa, não reavaliada por lote).

## Casos de revisão manual

2 casos — ver `legacy-review-2023-2024.md`.

## Nenhuma escrita real

Esta etapa é somente leitura/preflight. Nenhuma matéria ou imagem foi importada.
