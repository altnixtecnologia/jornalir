# Lote 2015-2016 — CONCLUÍDO

Gerado em: 2026-09-26

Autorizado por `docs/CHATGPT_REVIEW.md` (Fase 35E, revisão sobre HEAD `1526106`, veredito "ARTIGOS CONCLUÍDOS; LOTE AINDA NÃO PODE SER MARCADO COMPLETE POR 80 IMAGENS GIF PENDENTES"). Corrigido o bloqueio de MIME e reconciliado o restante. Este relatório documenta a execução completa e a validação final.

## Linha do tempo desta etapa

1. Execução completa do lote (sem `--limit`), feita manualmente pelo usuário: **1.602 novas + 20 do canário reconciliadas = 1.622 articles**, **2.945/3.025 imagens** — 80 falharam por MIME `image/gif` não permitido no bucket `article-media`.
2. Migration `20261005100000_article_media_allow_gif.sql` (aplicada): acrescenta `image/gif` aos MIME permitidos do bucket `article-media` — nenhuma outra mudança (bucket não recriado, nenhum objeto apagado, nenhuma policy alterada).
3. Retry do mesmo comando: as 1.622 matérias e as 2.945 imagens já corretas foram reencontradas/reconciliadas (0 duplicatas), e as 80 imagens GIF pendentes foram enviadas com sucesso.
4. `legacy_migration_batches.status` = **`complete`**.

## Comando final (idempotente, executado duas vezes ao todo nesta etapa)

```
node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2015-2016 --mode=import --commit --rps=4
```

## Resultado bruto de cada execução

**1ª execução (completa, antes da correção de MIME):**
```json
{ "imported": 1602, "skippedExisting": 20, "failedArticles": 0,
  "uploadedImages": 2900, "reusedImages": 0, "alreadyLinkedImages": 45,
  "correctedImages": 0, "failedImages": 80 }
```
Lote: `incomplete` (2.945/3.025 imagens reconciliadas).

**2ª execução (depois da migration de GIF):**
```json
{ "imported": 0, "skippedExisting": 1622, "failedArticles": 0,
  "uploadedImages": 80, "reusedImages": 0, "alreadyLinkedImages": 2945,
  "correctedImages": 0, "failedImages": 0 }
```
Lote: **`complete`** (3.025/3.025 imagens reconciliadas).

## Validação final — direto no Supabase/Storage (paginada, não limitada a 1.000 linhas)

| Checagem | Esperado | Encontrado | OK |
|---|---|---|---|
| `articles` com `origin=legacy_site` | 1.622 | 1.622 | ✅ |
| Slugs únicos | 1.622 | 1.622 | ✅ |
| `article_external_sources` (provider legado) | 1.622 | 1.622 | ✅ |
| `article_id` únicos em sources | 1.622 | 1.622 | ✅ |
| `external_id` únicos em sources | 1.622 | 1.622 | ✅ |
| `media_assets` com `origin_source_url` | 3.025 | 3.025 | ✅ |
| `origin_source_url` únicos | 3.025 | 3.025 | ✅ |
| `storage_path` únicos | 3.025 | 3.025 | ✅ |
| `article_media` (vínculos) | 3.025 | 3.025 | ✅ |
| Pares `(article_id, media_id)` únicos | 3.025 | 3.025 | ✅ |
| Artigos com mais de 1 capa | 0 | 0 | ✅ |
| Artigos com exatamente 1 capa | 1.506 | 1.506 | ✅ |
| Artigos com 0 imagens | 116 | 116 | ✅ |
| `article_placements` para matérias do legado | 0 | 0 | ✅ |
| Artigos com `status != published` | 0 | 0 | ✅ |
| Problemas de `sort_order`/capa fora de posição | 0 | 0 | ✅ |
| `needs_review` (13) vazados para a carga | 0 | 0 | ✅ |
| Exceções de data (7) vazadas para a carga | 0 | 0 | ✅ |
| GIFs presentes (`media_assets.storage_path` terminando em `.gif`) | 80 | 80 | ✅ |
| Amostra de 5 GIFs confirmados fisicamente no bucket (`storage.list`) | 5/5 | 5/5 | ✅ |
| Distribuição por editoria | geral=1.114, esporte=231, política=228, sociais=49 | idêntico | ✅ |

Dados brutos completos: `scripts/legacy-audit/output/batches/2015-2016/batch-final-validation.json` (não versionado — derivado).

## Período coberto pelo lote (confirmado no banco)

- Primeira data: `2015-06-27T13:44:00Z`
- Última data: `2016-12-23T19:14:00Z`

## O que ficou de fora (por design, não esquecido)

- **13 casos `needs_review`** (ver `docs/legacy-review-2015-2016.md`) — continuam fora da carga automática, aguardando revisão humana caso a caso.
- **7 exceções de data** (`31/12/1969`, bug do CMS legado) — continuam fora de qualquer lote automático.
- **Classificados/Agricultura** — não existem no intervalo 2015-2016 (confirmado no preflight), então não se aplicam a este lote; a quarentena editorial (`lib/integrity.mjs`) segue valendo para lotes futuros.

## Achado conhecido, não bloqueante

Título de `external_id=416746` tem um `?` isolado onde o site original provavelmente tinha um travessão — problema de decodificação isolado (1/1.635 títulos do lote), documentado desde a Fase 35D, não corrigido nesta etapa (fora do escopo desta migração).

## Conclusão

**Lote 2015-2016: 1.622/1.622 matérias elegíveis migradas, 3.025/3.025 referências de imagem reconciliadas, 0 falhas, 0 duplicatas, nenhuma matéria fora do escopo aprovado foi tocada.** `legacy_migration_batches.status = complete`.

**Não iniciado o lote 2017-2018** — aguardando nova conferência do ChatGPT antes de prosseguir.
