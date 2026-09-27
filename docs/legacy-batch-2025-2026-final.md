# Lote 2025-2026 — CONCLUÍDO (último lote cronológico do legado)

Gerado em: 2026-09-28

Autorizado por `docs/CHATGPT_REVIEW.md` (revisão sobre HEAD `ca1a949`, veredito "AUTORIZADA carga real de 2025-2026" — usando o cache já completo, sem refetch e sem `--limit`).

## Comando (executado duas vezes)

```
node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2025-2026 --mode=import --commit --rps=4
```

## Resultado bruto de cada execução

**1ª execução (completa):**
```json
{ "imported": 5312, "skippedExisting": 0, "failedArticles": 0,
  "uploadedImages": 16033, "reusedImages": 0, "alreadyLinkedImages": 0,
  "correctedImages": 0, "failedImages": 2 }
```
Lote: `incomplete` (16.033/16.035 imagens reconciliadas). As 2 falhas foram **`Gateway Timeout`** — a mesma classe de erro transitório já vista em lotes anteriores, bem dentro do limite "pontual". Nenhum MIME real não suportado apareceu (a verificação de tipos de mídia incomuns feita no preflight da Fase 46/46B se confirmou correta).

**2ª execução (retry, sem `--limit`):**
```json
{ "imported": 0, "skippedExisting": 5312, "failedArticles": 0,
  "uploadedImages": 2, "reusedImages": 0, "alreadyLinkedImages": 16033,
  "correctedImages": 0, "failedImages": 0 }
```
Lote: **`complete`** (16.035/16.035 imagens reconciliadas).

## As 2 imagens com falha transitória

| URL original | Erro na 1ª tentativa | Resolução |
|---|---|---|
| `https://suitacdn.cloud-bricks.net/fotos/15776415/file/desktop/IMG_7716.JPG?1744408976` | Gateway Timeout | Reconciliada no retry |
| `https://suitacdn.cloud-bricks.net/fotos/15854913/file/desktop/colegiado%20amec.jfif1.jfif?1772738469` | Gateway Timeout | Reconciliada no retry |

Volume (2 em 16.035, ambas transitórias e resolvidas) não se aproxima do limiar "dezenas/centenas". Nenhuma alteração de configuração foi necessária desta vez.

## Validação final — batch-scoped (`batch-final-validate.mjs --batch=2025-2026`)

| Checagem (escopada só a este lote) | Esperado | Encontrado | OK |
|---|---|---|---|
| `articles` deste lote | 5.312 | 5.312 | ✅ |
| `article_external_sources` deste lote | 5.312 | 5.312 | ✅ |
| Slugs únicos neste lote | 5.312 | 5.312 | ✅ |
| `media_assets` deste lote | 16.035 | 16.035 | ✅ |
| `article_media` (vínculos) deste lote | 16.035 | 16.035 | ✅ |
| Artigos com mais de 1 capa | 0 | 0 | ✅ |
| Artigos com exatamente 1 capa | 5.311 | 5.311 | ✅ |
| Artigos com 0 imagens | 1 | 1 | ✅ |
| `article_placements` para matérias deste lote | 0 | 0 | ✅ |
| Artigos com `status != published` | 0 | 0 | ✅ |
| Problemas de `sort_order`/capa fora de posição | 0 | 0 | ✅ |
| `needs_review` (2) vazados para a carga | 0 | 0 | ✅ |
| `quarantined`/`classificados` (27) vazados para a carga | 0 | 0 | ✅ (confirmado via consulta direta) |
| Exceções de data (7) vazadas para a carga | 0 | 0 | ✅ |
| GIFs deste lote | 6/6 | 6/6 | ✅ |

## Checagem GLOBAL (todos os 6 lotes — migração histórica completa)

| Checagem | Valor |
|---|---|
| Total de `articles` (2015-2016 + 2017-2018 + 2019-2020 + 2021-2022 + 2023-2024 + 2025-2026) | 23.292 |
| Slugs únicos globais | 23.292 (nenhuma colisão entre lotes) |
| Total de `article_external_sources` globais | 23.292 |
| `external_id`/`source_url` únicos globais | 23.292 / 23.292 (0 duplicidade por identidade) |
| Total de `media_assets` globais | 44.289 |
| `origin_source_url` únicos globais | 44.289 (nenhuma imagem duplicada entre lotes) |
| `storage_path` únicos globais | 44.289 |

Aritmética confirmada: 1.622 + 2.503 + 5.088 + 4.475 + 4.292 + 5.312 = 23.292 articles. Nenhuma matéria dos lotes anteriores foi alterada por esta carga.

## Auditoria de candidatos a duplicata (SOMENTE LEITURA — nada arquivado)

Rodada sobre todos os 23.292 artigos, mesma regra editorial. Ver `docs/legacy-duplicate-audit-2025-2026.md`.

**Resumo:**
- 65 grupos já resolvidos (54 Fase 43 + 10 Fase 44F + 1 Fase 45C) — esperado.
- **5 candidatos novos envolvendo 2025-2026** (3 corpo idêntico, 2 precisam inspeção) — nenhum arquivado.
- 14 candidatos antigos ainda pendentes (10 de 2015-2020 + 3 de 2021-2022 + 1 de 2023-2024) continuam intocados.

## Período coberto pelo lote

- Intervalo do lote: `2025-01-01` a `2026-12-31`.

## Categorias na carga real

Distribuição idêntica ao preflight aprovado: geral=3.292, sociais=771, esporte=314, policia=313, politica=297, saude=191, colunistas=68, agricultura=66.

## O que ficou de fora (por design)

- **2 casos `needs_review`** (corpo vazio) — continuam fora da carga automática.
- **27 casos `quarantined`/`classificados`** — categoria segue em quarentena até revisão humana específica.
- **7 exceções de data** — mesmas 7 globais já documentadas desde a Fase 34.

## Conclusão

**Lote 2025-2026: 5.312/5.312 matérias elegíveis migradas, 16.035/16.035 referências de imagem reconciliadas, 0 falhas finais, 0 duplicatas por identidade.** `legacy_migration_batches.status = complete`.

**Este era o último lote cronológico do legado.** A migração histórica (2015–2026) está tecnicamente completa quanto à carga de conteúdo. Não geradas Preview nem Production nesta etapa — aguardando conferência do ChatGPT.
