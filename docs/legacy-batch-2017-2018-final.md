# Lote 2017-2018 — CONCLUÍDO

Gerado em: 2026-09-26

Autorizado condicionalmente por `docs/CHATGPT_REVIEW.md` (revisão sobre HEAD `dd718cf`), após os 4 pré-requisitos obrigatórios (liberar `agricultura`, rerodar preflight, confirmar sem anomalia, generalizar o validador por lote) — todos concluídos na Fase 37.

## Linha do tempo desta etapa

1. `REVIEWED_CATEGORIES` passou a incluir `agricultura`; preflight rerodado sem forçar números — resultado real idêntico ao previsto: **2.503 eligible, 8 needs_review, 0 quarantined, 0 rejected, 4.093 referências de imagem**.
2. `scripts/legacy-audit/batch-final-validate.mjs` generalizado para `--batch=<key>` (escopado por lote, com checagem global de duplicidade separada) e testado retroativamente contra 2015-2016.
3. Execução completa (`--mode=import --commit --rps=4`, sem `--limit`), feita manualmente pelo usuário — Claude tentou primeiro e foi bloqueado pelo sandbox ("Production Deploy"), não contornado.
4. Resultado da 1ª execução: `imported: 2503, failedArticles: 0, uploadedImages: 4092, failedImages: 1` — uma falha isolada de rede (`Gateway Timeout`) ao baixar uma imagem.
5. Confirmado que a URL da imagem estava novamente acessível (HTTP 200) e que a falha foi transitória, não um problema de configuração.
6. Retry do mesmo comando: as 2.503 matérias e as 4.092 imagens já corretas foram reencontradas/reconciliadas (0 duplicatas), e a 1 imagem pendente foi enviada com sucesso.
7. `legacy_migration_batches.status` = **`complete`**.

## Comando (executado duas vezes)

```
node --env-file=".env.local" scripts/legacy-audit/migrate.mjs --batch=2017-2018 --mode=import --commit --rps=4
```

## Resultado bruto de cada execução

**1ª execução:**
```json
{ "imported": 2503, "skippedExisting": 0, "failedArticles": 0,
  "uploadedImages": 4092, "reusedImages": 0, "alreadyLinkedImages": 0,
  "correctedImages": 0, "failedImages": 1 }
```
Lote: `incomplete` (4.092/4.093 imagens reconciliadas).

**2ª execução (retry):**
```json
{ "imported": 0, "skippedExisting": 2503, "failedArticles": 0,
  "uploadedImages": 1, "reusedImages": 0, "alreadyLinkedImages": 4092,
  "correctedImages": 0, "failedImages": 0 }
```
Lote: **`complete`** (4.093/4.093 imagens reconciliadas).

## A imagem pendente (registrada conforme pedido)

| Campo | Valor |
|---|---|
| Matéria (slug) | `inicia-nesta-quinta-feira-dia-16-de-novembro-o-47o-jerva-e-9o-parajerva-414521` |
| URL original | `https://suitacdn.cloud-bricks.net/fotos/627213/file/desktop/15108258540260.jpg?1675068304` |
| Erro na 1ª tentativa | `Gateway Timeout` |
| Causa | Falha de rede transitória do lado do servidor legado (não é um problema de MIME/configuração como o caso dos GIFs no lote anterior) |
| Verificação manual | `curl` confirmou HTTP 200 na mesma URL logo depois |
| Resolução | Reconciliada automaticamente no retry (upload bem-sucedido, vínculo criado com `role`/`sort_order` corretos) |
| Estado final | Nenhuma pendência — 4.093/4.093 imagens do lote reconciliadas |

## Validação final — batch-scoped, direto no Supabase/Storage

| Checagem (escopada só a este lote) | Esperado | Encontrado | OK |
|---|---|---|---|
| `articles` deste lote | 2.503 | 2.503 | ✅ |
| Slugs únicos neste lote | 2.503 | 2.503 | ✅ |
| `article_external_sources` deste lote | 2.503 | 2.503 | ✅ |
| `media_assets` deste lote | 4.093 | 4.093 | ✅ |
| `article_media` (vínculos) deste lote | 4.093 | 4.093 | ✅ |
| Artigos com mais de 1 capa | 0 | 0 | ✅ |
| Artigos com exatamente 1 capa | 2.361 | 2.361 | ✅ |
| Artigos com 0 imagens | 142 | 142 | ✅ |
| `article_placements` para matérias deste lote | 0 | 0 | ✅ |
| Artigos com `status != published` | 0 | 0 | ✅ |
| Problemas de `sort_order`/capa fora de posição | 0 | 0 | ✅ |
| `needs_review` (8) vazados para a carga | 0 | 0 | ✅ |
| Exceções de data (7) vazadas para a carga | 0 | 0 | ✅ |
| GIFs deste lote (amostra de 4, confirmados no Storage) | 4/4 | 4/4 | ✅ |
| Distribuição por editoria | agricultura=5, geral=2.154, esporte=204, política=95, sociais=45 | idêntico | ✅ |

## Checagem GLOBAL (todos os lotes já migrados — nunca duplicar entre lotes)

| Checagem | Valor |
|---|---|
| Total de `articles` (2015-2016 + 2017-2018) | 4.125 |
| Slugs únicos globais | 4.125 (nenhuma colisão entre lotes) |
| Total de `article_external_sources` globais | 4.125 |
| `external_id`/`source_url` únicos globais | 4.125 / 4.125 |
| Total de `media_assets` globais | 7.118 |
| `origin_source_url` únicos globais | 7.118 (nenhuma imagem duplicada entre lotes) |
| `storage_path` únicos globais | 7.118 |

Dados brutos completos: `scripts/legacy-audit/output/batches/2017-2018/batch-final-validation.json` (não versionado — derivado).

## Período coberto pelo lote (confirmado no banco)

- Primeira data: `2017-01-02T17:35:00Z`
- Última data: `2018-12-19T22:14:00Z`

## O que ficou de fora (por design)

- **8 casos `needs_review`** (ver `docs/legacy-review-2017-2018.md`) — continuam fora da carga automática.
- **7 exceções de data** (`31/12/1969`) — mesmas 7 globais já documentadas desde a Fase 34, continuam fora de qualquer lote.
- **`classificados`** — não apareceu neste intervalo (0 itens); continua em quarentena automática para lotes futuros.

## Achado da Fase 37 confirmado na prática

`agricultura` foi liberada e seus 5 itens migraram normalmente, sem nenhum tratamento especial além de sair da quarentena — confirmando que a categoria não tinha nenhum problema estrutural real.

## Conclusão

**Lote 2017-2018: 2.503/2.503 matérias elegíveis migradas, 4.093/4.093 referências de imagem reconciliadas, 0 falhas finais, 0 duplicatas (nem dentro do lote, nem contra 2015-2016), nenhuma matéria fora do escopo aprovado foi tocada.** `legacy_migration_batches.status = complete`.

**Não iniciado o lote 2019-2020** — aguardando nova conferência do ChatGPT antes de prosseguir.
