# Lote 2019-2020 — CONCLUÍDO

Gerado em: 2026-09-26

Autorizado por `docs/CHATGPT_REVIEW.md` (revisão sobre HEAD `9bca751`, veredito "AUTORIZADA A CARGA REAL 2019–2020" — sem exigir novo canário, já que motor/retomada/mídia/validador foram exercitados nos dois lotes anteriores).

## Comando (executado duas vezes)

```
node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2019-2020 --mode=import --commit --rps=4
```

## Resultado bruto de cada execução

**1ª execução (completa):**
```json
{ "imported": 5088, "skippedExisting": 0, "failedArticles": 0,
  "uploadedImages": 7080, "reusedImages": 0, "alreadyLinkedImages": 0,
  "correctedImages": 0, "failedImages": 2 }
```
Lote: `incomplete` (7.080/7.082 imagens reconciliadas). As 2 falhas foram `Gateway Timeout` — a mesma classe de erro transitório já vista no lote 2017-2018, dentro do limite "pontual" definido pelo usuário (nunca dezenas/centenas).

**2ª execução (retry):**
```json
{ "imported": 0, "skippedExisting": 5088, "failedArticles": 0,
  "uploadedImages": 2, "reusedImages": 0, "alreadyLinkedImages": 7080,
  "correctedImages": 0, "failedImages": 0 }
```
Lote: **`complete`** (7.082/7.082 imagens reconciliadas).

## As 2 imagens com falha transitória (registradas conforme pedido)

| # | URL original | Erro na 1ª tentativa | Verificação | Resolução |
|---|---|---|---|---|
| 1 | `https://suitacdn.cloud-bricks.net/fotos/634779/file/desktop/15931181822830.jpeg?1675098169` | Gateway Timeout | `curl` confirmou HTTP 200 logo depois | Reconciliada no retry |
| 2 | `https://suitacdn.cloud-bricks.net/fotos/632808/file/desktop/15866117758341.jpg?1675091228` | Gateway Timeout | `curl` confirmou HTTP 200 logo depois | Reconciliada no retry |

Volume (2 em 7.082, ambas transitórias e resolvidas) não se aproxima do limiar "dezenas/centenas" que exigiria parar e investigar.

## Validação final — batch-scoped, direto no Supabase/Storage

| Checagem (escopada só a este lote) | Esperado | Encontrado | OK |
|---|---|---|---|
| `articles` deste lote | 5.088 | 5.088 | ✅ |
| Slugs únicos neste lote | 5.088 | 5.088 | ✅ |
| `article_external_sources` deste lote | 5.088 | 5.088 | ✅ |
| `media_assets` deste lote | 7.082 | 7.082 | ✅ |
| `article_media` (vínculos) deste lote | 7.082 | 7.082 | ✅ |
| Artigos com mais de 1 capa | 0 | 0 | ✅ |
| Artigos com exatamente 1 capa | 5.039 | 5.039 | ✅ |
| Artigos com 0 imagens | 49 | 49 | ✅ |
| `article_placements` para matérias deste lote | 0 | 0 | ✅ |
| Artigos com `status != published` | 0 | 0 | ✅ |
| Problemas de `sort_order`/capa fora de posição | 0 | 0 | ✅ |
| `needs_review` (12) vazados para a carga | 0 | 0 | ✅ |
| Exceções de data (7) vazadas para a carga | 0 | 0 | ✅ |
| GIFs deste lote (2, confirmados no Storage) | 2/2 | 2/2 | ✅ |
| Distribuição por editoria | policia=298, saude=885, agricultura=39, colunistas=28, geral=3.450, esporte=107, política=236, sociais=45 | idêntico | ✅ |

## Checagem GLOBAL (todos os 3 lotes já migrados — nunca duplicar entre lotes)

| Checagem | Valor |
|---|---|
| Total de `articles` (2015-2016 + 2017-2018 + 2019-2020) | 9.213 |
| Slugs únicos globais | 9.213 (nenhuma colisão entre os 3 lotes) |
| Total de `article_external_sources` globais | 9.213 |
| `external_id`/`source_url` únicos globais | 9.213 / 9.213 |
| Total de `media_assets` globais | 14.200 |
| `origin_source_url` únicos globais | 14.200 (nenhuma imagem duplicada entre lotes) |
| `storage_path` únicos globais | 14.200 |

Aritmética confirmada: 1.622 + 2.503 + 5.088 = 9.213 articles; 3.025 + 4.093 + 7.082 = 14.200 media. Nenhuma matéria dos lotes 2015-2018 foi alterada por esta execução.

Dados brutos completos: `scripts/legacy-audit/output/batches/2019-2020/batch-final-validation.json` (não versionado — derivado).

## Período coberto pelo lote (confirmado no banco)

- Primeira data: `2019-01-02T19:15:00Z`
- Última data: `2020-12-30T17:30:00Z`

## Categorias novas confirmadas na carga real

- **`policia`** (298 matérias) — mapeamento `policia → Polícia` já confirmado no preflight (Fase 40), migrado sem nenhum tratamento especial.
- **`saude`** (885 matérias) — primeira carga real de volume na editoria Saúde.
- **`agricultura`** (39 matérias) — já liberada desde a Fase 37, migrou normalmente.
- **`colunistas`** (28 matérias, agregando as 4 sub-colunas do legado).

## O que ficou de fora (por design)

- **12 casos `needs_review`** (ver `docs/legacy-review-2019-2020.md`) — continuam fora da carga automática.
- **7 exceções de data** (`31/12/1969`) — mesmas 7 globais já documentadas desde a Fase 34.
- **`classificados`** — não apareceu neste intervalo (0 itens); continua em quarentena automática.

## Conclusão

**Lote 2019-2020: 5.088/5.088 matérias elegíveis migradas, 7.082/7.082 referências de imagem reconciliadas, 0 falhas finais, 0 duplicatas (nem dentro do lote, nem contra os 2 lotes anteriores).** `legacy_migration_batches.status = complete`.

**Não iniciado o lote 2021-2022** — aguardando nova conferência do ChatGPT.
