# Preflight — lote 2025-2026 (SOMENTE LEITURA, nada importado)

Gerado em: 2026-09-27T18:15:35.967Z

Intervalo: 2025-01-01 a 2026-12-31.

## Números do lote

| Métrica | Valor |
|---|---|
| Candidatas no intervalo (deduplicadas por identidade) | 5341 |
| Exceções de data (fora de qualquer lote automático) | 7 |
| **Elegíveis** | **5312** |
| Precisam de revisão manual (`needs_review`) | 2 |
| Em quarentena editorial (`quarantined`) | 27 |
| Rejeitadas (falha de busca) | 0 |
| Com imagem | 5311 |
| Sem imagem | 1 |
| Referências de imagem (elegíveis) | 16035 |
| URLs de imagem únicas (elegíveis) | 16035 |

## Distribuição por editoria (elegíveis)

- geral: 3292
- esporte: 314
- policia: 313
- politica: 297
- saude: 191
- sociais: 771
- agricultura: 66
- colunistas: 68

## Categorias encontradas

- `agricultura` apareceu na distribuição por editoria acima? **Sim (66 itens, já revisada/liberada — ver REVIEWED_CATEGORIES em lib/integrity.mjs)**.
- `classificados` apareceu neste lote (sempre em quarentena, nunca elegível automaticamente)? **Sim (27 itens)** — ver `legacy-quarantined-2025-2026.md`.
- `classificados` continua em quarentena automática em todos os lotes até revisão humana específica da categoria inteira.

## Achado novo: `classificados` cresceu de 3 (2023-2024) para 27 itens

Todos os 27 continuam corretamente barrados pela quarentena editorial (nunca elegíveis automaticamente). O crescimento em relação ao lote anterior é esperado (mais tempo de site = mais itens na categoria), mas reforça a necessidade de uma revisão humana específica antes de qualquer liberação — a amostra de 2023-2024 já havia mostrado que nem todo item sob `/classificados/` é um classificado de fato.

## Achado novo: densidade de imagens por matéria muito mais alta

Este lote tem **16.035 referências de imagem para 5.312 elegíveis** (~3,0 imagens/matéria), quase o dobro da densidade observada nos lotes anteriores (~1,5–1,6 imagens/matéria em 2015-2024). Não é um problema — reflete um uso mais rico de galerias de fotos nas matérias mais recentes — mas é registrado aqui porque impacta diretamente o tempo estimado da futura carga real (mais uploads de imagem por matéria).

## Verificação de tipos de mídia incomuns (pedido explícito da revisão, antes da futura carga)

**Correção (revisão sobre HEAD `c2b7f0a`):** a primeira versão desta tabela somava 21.408 ocorrências, incompatível com as 16.035 referências elegíveis do preflight. Causa raiz, dupla:

1. o script original varria **todas** as 5.341 entradas do cache (inclusive as 27 `quarantined` e os 2 `needs_review`, que não entram na carga), em vez de só as 5.312 `eligibleList`;
2. o script original contava `coverUrl` e cada item de `galleryImages` separadamente, sem aplicar a regra de `collectImageRefs()` (a mesma função usada pelo preflight/importador) que **pula** um item de galeria cujo `src` seja igual ao `coverUrl` — inflando a contagem de ocorrências sempre que a capa também aparecia na galeria.

Recalculado exclusivamente a partir de `eligibleList` (as 5.312 matérias elegíveis) + `collectImageRefs(detail)` — exatamente o par usado pelo preflight/importador —, classificando cada referência por extensão de forma **mutuamente exclusiva** pelo `pathname` da URL (sem query string):

| Extensão na URL | Ocorrências | URLs únicas | Content-Type real (verificado via HEAD) |
|---|---|---|---|
| `.jpg` | 8.793 | 8.793 | `image/jpeg` (já suportado) |
| `.jpeg` | 3.399 | 3.399 | `image/jpeg` (já suportado) |
| `.jfif` | 2.427 | 2.427 | `image/jpeg` (12 amostras verificadas) |
| `.png` | 1.018 | 1.018 | `image/png` (já suportado) |
| `.webp` | 389 | 389 | `image/webp` (já suportado) |
| `.gif` | 6 | 6 | `image/gif` (já suportado) |
| `.mhtml` | 2 | 2 | `image/jpeg` (2/2 amostras verificadas) |
| `.enc` | 1 | 1 | `image/png` (1/1 amostra verificada) |
| **Soma** | **16.035** | — | fecha exatamente com as referências elegíveis do preflight |

As URLs `.mhtml`/`.enc` verificadas continuam sendo as mesmas 2+1 URLs distintas já testadas (não mudaram — só a contagem de ocorrências duplicadas foi corrigida). As amostras de `.jfif` também permanecem válidas (mesmas 12 URLs testadas via `HEAD`, ainda dentro do conjunto elegível correto).

**Achado confirmado:** a extensão do arquivo não corresponde necessariamente ao tipo real do conteúdo — `.jfif`/`.mhtml`/`.enc` são nomes de arquivo enganosos, mas o servidor de origem devolve o `Content-Type` HTTP real e correto (`image/jpeg` ou `image/png`) em todas as amostras testadas. Isso é consistente com o comportamento do importador (`migrate.mjs`), que **decide o tipo pelo `Content-Type` da resposta HTTP, nunca pela extensão da URL** — logo essas extensões incomuns não deveriam causar falha de upload como aconteceu com o `.bmp` genuíno da Fase 45B (aquele caso falhou porque o `Content-Type` real ERA `image/bmp`, não porque a extensão era incomum).

Verificação feita via requisições `HEAD` (sem baixar o conteúdo, sem gravar nada, sem refetch de matéria): 12 amostras `.jfif` + as 2 URLs `.mhtml` + a 1 URL `.enc` — **15/15 bateram com um MIME já suportado pelo bucket**. Não foram testadas as 2.427 URLs `.jfif` uma a uma; o risco residual de algum outlier isolado na carga real é o mesmo tipo de risco pontual já tratado com sucesso na Fase 45B (bucket ampliado sob demanda, sem refetch do lote).

## Localidade

Nenhuma inferência de localidade feita — todo o legado permanece `Geral` (regra fixa, não reavaliada por lote).

## Casos de revisão manual

2 casos — ver `legacy-review-2025-2026.md`.

## Nenhuma escrita real

Esta etapa é somente leitura/preflight. Nenhuma matéria ou imagem foi importada.
