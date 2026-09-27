# Lote 2023-2024 — CONCLUÍDO

Gerado em: 2026-09-27

Autorizado por `docs/CHATGPT_REVIEW.md` (revisão sobre HEAD `2521e81`, veredito "AUTORIZADA a carga real" de 2023-2024, usando o cache já completo, sem refetch e sem `--limit`).

## Comando (executado duas vezes)

```
node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2023-2024 --mode=import --commit --rps=4
```

## Resultado bruto de cada execução

**1ª execução (completa):**
```json
{ "imported": 4292, "skippedExisting": 0, "failedArticles": 0,
  "uploadedImages": 7164, "reusedImages": 0, "alreadyLinkedImages": 0,
  "correctedImages": 0, "failedImages": 1 }
```
Lote: `incomplete` (7.164/7.165 imagens reconciliadas). A 1 falha **não foi transitória**: `mime type image/bmp is not supported` — o bucket `article-media` ainda não aceitava BMP (mesma classe de achado da Fase 35E com GIF).

**Correção aplicada antes do retry:** migration `supabase/migrations/20261006100000_article_media_allow_bmp.sql` — atualiza SOMENTE `allowed_mime_types` do bucket (acrescenta `image/bmp`), sem recriar bucket, sem apagar objetos, sem alterar policy. Aplicada manualmente pelo usuário via `supabase db push` (o sandbox bloqueou a alteração direta do bucket como "Modify Shared Resources").

**2ª execução (retry, sem `--limit`, após a migration):**
```json
{ "imported": 0, "skippedExisting": 4292, "failedArticles": 0,
  "uploadedImages": 1, "reusedImages": 0, "alreadyLinkedImages": 7164,
  "correctedImages": 0, "failedImages": 0 }
```
Lote: **`complete`** (7.165/7.165 imagens reconciliadas).

## A imagem com falha (não-transitória, corrigida via migration)

| URL original | Erro na 1ª tentativa | Causa raiz | Resolução |
|---|---|---|---|
| `https://suitacdn.cloud-bricks.net/fotos/890776/file/desktop/brs.bmp?1704314984` | `mime type image/bmp is not supported` | Bucket `article-media` não tinha `image/bmp` em `allowed_mime_types` | Migration aplicada, reconciliada no retry |

## Validação final — batch-scoped (`batch-final-validate.mjs --batch=2023-2024`)

| Checagem (escopada só a este lote) | Esperado | Encontrado | OK |
|---|---|---|---|
| `articles` deste lote | 4.292 | 4.292 | ✅ |
| `article_external_sources` deste lote | 4.292 | 4.292 | ✅ |
| Slugs únicos neste lote | 4.292 | 4.292 | ✅ |
| `media_assets` deste lote | 7.165 | 7.165 | ✅ |
| `article_media` (vínculos) deste lote | 7.165 | 7.165 | ✅ |
| Artigos com mais de 1 capa | 0 | 0 | ✅ |
| Artigos com exatamente 1 capa | 4.276 | 4.276 | ✅ |
| Artigos com 0 imagens | 16 | 16 | ✅ |
| `article_placements` para matérias deste lote | 0 | 0 | ✅ |
| Artigos com `status != published` | 0 | 0 | ✅ |
| Problemas de `sort_order`/capa fora de posição | 0 | 0 | ✅ |
| `needs_review` (2) vazados para a carga | 0 | 0 | ✅ |
| `quarantined`/`classificados` (3) vazados para a carga | 0 | 0 | ✅ (confirmado via consulta direta) |
| Exceções de data (7) vazadas para a carga | 0 | 0 | ✅ |
| GIFs deste lote | 5/5 | 5/5 | ✅ |

## Checagem GLOBAL (todos os 5 lotes já migrados)

| Checagem | Valor |
|---|---|
| Total de `articles` (2015-2016 + 2017-2018 + 2019-2020 + 2021-2022 + 2023-2024) | 17.980 |
| Slugs únicos globais | 17.980 (nenhuma colisão entre lotes) |
| Total de `article_external_sources` globais | 17.980 |
| `external_id`/`source_url` únicos globais | 17.980 / 17.980 (0 duplicidade por identidade) |
| Total de `media_assets` globais | 28.254 |
| `origin_source_url` únicos globais | 28.254 (nenhuma imagem duplicada entre lotes) |
| `storage_path` únicos globais | 28.254 |

Aritmética confirmada: 1.622 + 2.503 + 5.088 + 4.475 + 4.292 = 17.980 articles. Nenhuma matéria dos lotes anteriores foi alterada por esta carga.

## Auditoria de candidatos a duplicata (SOMENTE LEITURA — nada arquivado)

Rodada sobre todos os 17.980 artigos, mesma regra editorial (título+data é só candidato; confirmação exige corpo idêntico/quase idêntico). Ver `docs/legacy-duplicate-audit-2023-2024.md`.

**Resumo:**
- 64 grupos já resolvidos (54 da Fase 43 + 10 da Fase 44F) — esperado, não são achados novos.
- **2 candidatos novos envolvendo 2023-2024** (1 corpo idêntico, 1 precisa inspeção) — nenhum arquivado.
- 13 candidatos antigos ainda pendentes (10 de 2015-2020 + 3 de 2021-2022) continuam intocados, como esperado.

## Período coberto pelo lote

- Intervalo do lote: `2023-01-01` a `2024-12-31`.

## Categorias na carga real

Distribuição idêntica ao preflight aprovado: colunistas=43, geral=3.125, esporte=231, policia=76, politica=261, saude=195, sociais=193, agricultura=168.

## O que ficou de fora (por design)

- **2 casos `needs_review`** (corpo vazio) — continuam fora da carga automática.
- **3 casos `quarantined`/`classificados`** — primeira aparição real da categoria, nenhum liberado; preservados para revisão humana específica futura.
- **7 exceções de data** — mesmas 7 globais já documentadas desde a Fase 34.

## Conclusão

**Lote 2023-2024: 4.292/4.292 matérias elegíveis migradas, 7.165/7.165 referências de imagem reconciliadas (incluindo 1 imagem BMP após correção da migration do bucket), 0 falhas finais, 0 duplicatas por identidade.** `legacy_migration_batches.status = complete`.

**Não iniciado o lote 2025-2026** — aguardando nova conferência do ChatGPT.
